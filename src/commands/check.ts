import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { loadConfig } from "../config";
import {
  getCurrentCommitSha,
  getMainBranchMergeBase,
  getDiffBetweenCommits,
  getRelatedProdFiles,
  getStagedDiff,
  getUncommittedDiff,
  getFileFromIndex,
} from "../git";
import {
  readHead,
  writeHead,
  ensureAuditDir,
  auditDir,
  statusDir,
  moveToApproved,
  moveToResolved,
} from "../audit-folder";
import { parseDiff } from "../diff-parser";
import { runRuleEngine } from "../rule-engine";
import { generateStubMarkdown } from "../markdown-writer";
import { parseMarkdown } from "../markdown-reader";
import { extractTestBlocks } from "../test-block-extractor";
import { VerificationStore, type VerificationRecord } from "../db/verification-store";

import { resolveWithinBase, assertSafeRelativePath } from "../path-guard";

export type CheckMode = "committed" | "staged" | "uncommitted";

async function getFileAtCommit(sha: string, filePath: string, cwd: string): Promise<string> {
  assertSafeRelativePath(filePath);
  const result = await $`git show ${sha}:${filePath}`.cwd(cwd).quiet().nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}

async function getFileFromWorkingTree(filePath: string, cwd: string): Promise<string> {
  try {
    const safePath = resolveWithinBase(cwd, filePath);
    return await readFile(safePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw err;
  }
}

function splitRawDiffByFile(rawDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = rawDiff.split("\n");
  const headers: { path: string; start: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m =
      lines[i].match(/^diff --git "a\/(.+)" "b\/(.+)"$/) ??
      lines[i].match(/^diff --git a\/(.+) b\/(.+)$/);
    if (m) {
      headers.push({ path: m[2], start: i });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].start;
    const end = i + 1 < headers.length ? headers[i + 1].start : lines.length;
    let endLine = end;
    while (endLine > start && lines[endLine - 1] === "") endLine--;
    result.set(headers[i].path, lines.slice(start, endLine).join("\n"));
  }

  return result;
}

import type { TestBlock } from "../test-block-extractor";

function collectTestFunctionNames(blocks: TestBlock[]): string[] {
  const names: string[] = [];
  for (const block of blocks) {
    if (block.type === "it" || block.type === "test") {
      names.push(block.name);
    }
    if (block.children.length > 0) {
      names.push(...collectTestFunctionNames(block.children));
    }
  }
  return names;
}

export async function check(
  cwd: string = process.cwd(),
  mode: CheckMode = "committed",
): Promise<void> {
  const config = await loadConfig(cwd);
  await ensureAuditDir(cwd);

  const diffGlobs = [...config.testGlobs, ...config.excludeGlobs.map((g) => `:!${g}`)];

  let fromSha: string;
  let toLabel: string;
  let rawDiff: string;

  if (mode === "committed") {
    const storedHead = await readHead(cwd);

    const toSha = await getCurrentCommitSha(cwd);
    if (!toSha) {
      console.error("test-verifier: no commits found in the repository.");
      process.exit(1);
    }

    if (!storedHead) {
      const mergeBase = await getMainBranchMergeBase(cwd);
      const initSha = mergeBase ?? toSha;
      await writeHead(cwd, initSha);
      if (mergeBase && mergeBase !== toSha) {
        console.log(`test-verifier: HEAD initialized at merge-base ${initSha} (main branch)`);
        fromSha = initSha;
        toLabel = toSha;
        rawDiff = await getDiffBetweenCommits(fromSha, toSha, diffGlobs, cwd);
      } else {
        console.log(`test-verifier: HEAD initialized at ${initSha}`);
        return;
      }
    } else if (storedHead === toSha) {
      console.log("test-verifier: no new commits to check.");
      return;
    } else {
      fromSha = storedHead;
      toLabel = toSha;
      rawDiff = await getDiffBetweenCommits(fromSha, toSha, diffGlobs, cwd);
    }
  } else {
    const currentSha = await getCurrentCommitSha(cwd);
    if (!currentSha) {
      console.error("test-verifier: no commits found in the repository.");
      process.exit(1);
    }
    fromSha = currentSha;
    toLabel = mode === "staged" ? "STAGED" : "UNCOMMITTED";
    rawDiff =
      mode === "staged"
        ? await getStagedDiff(diffGlobs, cwd)
        : await getUncommittedDiff(diffGlobs, cwd);
  }

  if (!rawDiff) {
    console.log("test-verifier: no test file changes detected.");
    if (mode === "committed") {
      await writeHead(cwd, toLabel);
    }
    return;
  }

  const fileDiffs = parseDiff(rawDiff);
  const rawDiffByFile = splitRawDiffByFile(rawDiff);
  rawDiff = "";

  const store = new VerificationStore(auditDir(cwd));

  let stubCount = 0;
  let autoApprovedCount = 0;
  let resolvedCount = 0;

  try {
    for (const fileDiff of fileDiffs) {
      const testFilePath = fileDiff.newPath;

      const beforeContent = await getFileAtCommit(fromSha, fileDiff.oldPath, cwd);
      let afterContent: string;
      if (mode === "committed") {
        afterContent = await getFileAtCommit(toLabel, testFilePath, cwd);
      } else if (mode === "staged") {
        afterContent = await getFileFromIndex(testFilePath, cwd);
      } else {
        afterContent = await getFileFromWorkingTree(testFilePath, cwd);
      }

      const ruleResult = runRuleEngine({
        filePath: testFilePath,
        beforeContent,
        afterContent,
        diffs: [fileDiff],
        config,
      });

      const afterBlocks = extractTestBlocks(afterContent, testFilePath);
      const testFunctions = collectTestFunctionNames(afterBlocks);

      const needsFixRecords = store.findNeedsFixForTestFile(testFilePath);
      const pendingRecords = store.findPendingForTestFile(testFilePath);
      let parentVerificationId: string | undefined;
      const resolvedIds: { id: string; fromStatus: "needs_fix" | "pending" }[] = [];

      const autoApproveSet = new Set<string>(config.policy.autoApprove);
      const willAutoApprove = autoApproveSet.has(ruleResult.overallSeverity);

      for (const nf of needsFixRecords) {
        const overlappingFunctions = nf.testFunctions.filter((fn) => testFunctions.includes(fn));

        if (overlappingFunctions.length > 0 || nf.testFunctions.length === 0) {
          if (willAutoApprove) {
            resolvedIds.push({ id: nf.id, fromStatus: "needs_fix" });
          } else {
            const originalRules = new Set(nf.rule.split(",").map((r) => r.trim()));
            const currentRules = new Set(ruleResult.findings.map((f) => f.rule));

            const stillTriggered = [...originalRules].some((r) => currentRules.has(r));

            if (!stillTriggered) {
              resolvedIds.push({ id: nf.id, fromStatus: "needs_fix" });
            } else {
              parentVerificationId = nf.id;
            }
          }
        }
      }

      for (const pr of pendingRecords) {
        const overlappingFunctions = pr.testFunctions.filter((fn) => testFunctions.includes(fn));

        if (overlappingFunctions.length > 0 || pr.testFunctions.length === 0) {
          if (willAutoApprove) {
            resolvedIds.push({ id: pr.id, fromStatus: "pending" });
          } else {
            const originalRules = new Set(pr.rule.split(",").map((r) => r.trim()));
            const currentRules = new Set(ruleResult.findings.map((f) => f.rule));

            const stillTriggered = [...originalRules].some((r) => currentRules.has(r));

            if (!stillTriggered) {
              resolvedIds.push({ id: pr.id, fromStatus: "pending" });
            }
          }
        }
      }

      for (const { id: resolvedId, fromStatus } of resolvedIds) {
        const resolvedFilename = `${resolvedId.replace(/^tv_/, "")}.md`;
        const resolvedPath = join(statusDir(cwd, fromStatus), resolvedFilename);
        try {
          const mdContent = await readFile(resolvedPath, "utf-8");
          parseMarkdown(mdContent);
          let updated = mdContent.replace(/^status:\s*.+$/m, "status: resolved");
          const resolveMarker = "## Decision";
          const resolveIdx = updated.indexOf(resolveMarker);
          if (resolveIdx !== -1) {
            const beforeDecision = updated.slice(0, resolveIdx + resolveMarker.length);
            updated =
              beforeDecision +
              `\n\nauto-resolved\nrationale: original rules no longer triggered\ndate: ${new Date().toISOString()}\n`;
          }
          await writeFile(resolvedPath, updated);
          await moveToResolved(cwd, resolvedFilename, fromStatus);
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
        store.updateStatus(
          resolvedId,
          "resolved",
          "auto-resolved",
          "original rules no longer triggered",
        );
        console.log(`  RESOLVED ${testFilePath} (fixes ${resolvedId})`);
        resolvedCount++;
      }

      const prodFiles =
        mode === "committed" ? await getRelatedProdFiles(toLabel, testFilePath, cwd) : [];
      const fileRawDiff = rawDiffByFile.get(testFilePath) ?? "";
      rawDiffByFile.delete(testFilePath);

      const { filename, content, stub } = generateStubMarkdown({
        ruleResult,
        commit: toLabel,
        parentCommit: fromSha,
        rawDiff: fileRawDiff,
        prodFilesRelated: prodFiles,
        testFunctions,
        parentVerificationId,
      });

      const pendingPath = join(statusDir(cwd, "pending"), filename);
      await writeFile(pendingPath, content);
      stubCount++;

      const primaryRule =
        ruleResult.findings.length > 0 ? ruleResult.findings.map((f) => f.rule).join(",") : "safe";

      const now = new Date().toISOString();
      const record: VerificationRecord = {
        id: stub.id,
        testFile: testFilePath,
        testFunctions,
        rule: primaryRule,
        severity: ruleResult.overallSeverity,
        status: "pending",
        commit: toLabel,
        parentCommit: fromSha,
        diffHash: stub.diff_hash,
        createdAt: now,
        updatedAt: now,
        reviewer: null,
        rationale: null,
        parentVerificationId: parentVerificationId ?? null,
      };
      store.insert(record);

      if (willAutoApprove) {
        const approveMarker = "## Decision";
        const approveIdx = content.indexOf(approveMarker);
        if (approveIdx !== -1) {
          const beforeApprove = content.slice(0, approveIdx + approveMarker.length);
          const autoContent = (
            beforeApprove +
            `\n\nauto-approved by policy\nrationale: severity ${ruleResult.overallSeverity} is in autoApprove list\n`
          ).replace(/^status: pending$/m, "status: approved");
          await writeFile(pendingPath, autoContent);
        }
        await moveToApproved(cwd, filename);
        store.updateStatus(
          stub.id,
          "approved",
          "auto-approved",
          `severity ${ruleResult.overallSeverity} is in autoApprove list`,
        );
        autoApprovedCount++;
      }

      const lineageLabel = parentVerificationId ? ` (linked to ${parentVerificationId})` : "";
      const label = willAutoApprove ? " (auto-approved)" : lineageLabel;
      console.log(`  ${ruleResult.overallSeverity} ${testFilePath}${label}`);
    }
  } finally {
    store.close();
  }

  if (mode === "committed") {
    await writeHead(cwd, toLabel);
  }

  const pendingCount = stubCount - autoApprovedCount;
  const parts = [`${stubCount} file(s) analyzed`, `${autoApprovedCount} auto-approved`];
  if (resolvedCount > 0) {
    parts.push(`${resolvedCount} prior finding(s) resolved`);
  }
  console.log(`test-verifier: ${parts.join(", ")}.`);

  if (pendingCount > 0) {
    console.error(
      `test-verifier: ${pendingCount} finding(s) require review. Run 'test-verifier review' or 'test-verifier enrich'.`,
    );
    process.exit(1);
  } else {
    console.log("test-verifier: all clear — no findings require review.");
  }
}
