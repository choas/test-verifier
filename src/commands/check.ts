import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { loadConfig } from "../config";
import {
  getCurrentCommitSha,
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
import { maxSeverity } from "../rule-engine";
import { resolveWithinBase, assertSafeRelativePath } from "../path-guard";

export type CheckMode = "committed" | "staged" | "uncommitted";

async function getFileAtCommit(
  sha: string,
  filePath: string,
  cwd: string,
): Promise<string> {
  assertSafeRelativePath(filePath);
  const result = await $`git show ${sha}:${filePath}`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}

async function getFileFromWorkingTree(
  filePath: string,
  cwd: string,
): Promise<string> {
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
    const m = lines[i].match(/^diff --git "a\/(.+)" "b\/(.+)"$/) ?? lines[i].match(/^diff --git a\/(.+) b\/(.+)$/);
    if (m) {
      headers.push({ path: m[2], start: i });
    }
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].start;
    const end =
      i + 1 < headers.length ? headers[i + 1].start : lines.length;
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

  const diffGlobs = [
    ...config.testGlobs,
    ...config.excludeGlobs.map((g) => `:!${g}`),
  ];

  let fromSha: string;
  let toLabel: string;
  let rawDiff: string;

  if (mode === "committed") {
    const storedHead = await readHead(cwd);
    if (!storedHead) {
      console.error(
        "test-verifier: HEAD not initialized. Run `bunx test-verifier init` first.",
      );
      process.exit(1);
    }

    const toSha = await getCurrentCommitSha(cwd);
    if (storedHead === toSha) {
      console.log("test-verifier: no new commits to check.");
      return;
    }

    fromSha = storedHead;
    toLabel = toSha;
    rawDiff = await getDiffBetweenCommits(fromSha, toSha, diffGlobs, cwd);
  } else {
    fromSha = await getCurrentCommitSha(cwd);
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
    let parentVerificationId: string | undefined;
    const resolvedIds: string[] = [];

    if (needsFixRecords.length > 0) {
      for (const nf of needsFixRecords) {
        const overlappingFunctions = nf.testFunctions.filter((fn) =>
          testFunctions.includes(fn),
        );

        if (overlappingFunctions.length > 0 || nf.testFunctions.length === 0) {
          const originalRules = new Set(
            nf.rule.split(",").map((r) => r.trim()),
          );
          const currentRules = new Set(
            ruleResult.findings.map((f) => f.rule),
          );

          const stillTriggered = [...originalRules].some((r) =>
            currentRules.has(r),
          );

          if (!stillTriggered) {
            resolvedIds.push(nf.id);
          } else {
            parentVerificationId = nf.id;
          }
        }
      }
    }

    for (const resolvedId of resolvedIds) {
      const nfFilename = `${resolvedId.replace(/^tv_/, "")}.md`;
      const nfPath = join(statusDir(cwd, "needs_fix"), nfFilename);
      try {
        const mdContent = await readFile(nfPath, "utf-8");
        parseMarkdown(mdContent);
        let updated = mdContent.replace(/^status:\s*.+$/m, "status: resolved");
        const resolveMarker = "## Decision";
        const resolveIdx = updated.indexOf(resolveMarker);
        if (resolveIdx !== -1) {
          const beforeDecision = updated.slice(0, resolveIdx + resolveMarker.length);
          updated = beforeDecision + `\n\nauto-resolved\nrationale: original rules no longer triggered\ndate: ${new Date().toISOString()}\n`;
        }
        await writeFile(nfPath, updated);
        await moveToResolved(cwd, nfFilename, "needs_fix");
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      store.updateStatus(resolvedId, "resolved", "auto-resolved", "original rules no longer triggered");
      console.log(`  RESOLVED ${testFilePath} (fixes ${resolvedId})`);
      resolvedCount++;
    }

    const prodFiles =
      mode === "committed"
        ? await getRelatedProdFiles(toLabel, testFilePath, cwd)
        : [];
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

    const primaryRule = ruleResult.findings.length > 0
      ? ruleResult.findings.map((f) => f.rule).join(",")
      : "safe";

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

    const autoApproveSet = new Set<string>(config.policy.autoApprove);
    const isAutoApproved = autoApproveSet.has(ruleResult.overallSeverity);
    if (isAutoApproved) {
      const approveMarker = "## Decision";
      const approveIdx = content.indexOf(approveMarker);
      if (approveIdx !== -1) {
        const beforeApprove = content.slice(0, approveIdx + approveMarker.length);
        const autoContent = (beforeApprove + `\n\nauto-approved by policy\nrationale: severity ${ruleResult.overallSeverity} is in autoApprove list\n`)
          .replace(/^status: pending$/m, "status: approved");
        await writeFile(pendingPath, autoContent);
      }
      await moveToApproved(cwd, filename);
      store.updateStatus(stub.id, "approved", "auto-approved", `severity ${ruleResult.overallSeverity} is in autoApprove list`);
      autoApprovedCount++;
    }

    const lineageLabel = parentVerificationId
      ? ` (linked to ${parentVerificationId})`
      : "";
    const label = isAutoApproved ? " (auto-approved)" : lineageLabel;
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
    parts.push(`${resolvedCount} needs_fix resolved`);
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
