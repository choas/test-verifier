import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { loadConfig } from "../config";
import {
  getCurrentCommitSha,
  getDiffBetweenCommits,
  getRelatedProdFiles,
} from "../git";
import {
  readHead,
  writeHead,
  ensureAuditDir,
  statusDir,
  moveToApproved,
} from "../audit-folder";
import { parseDiff } from "../diff-parser";
import { runRuleEngine } from "../rule-engine";
import { generateStubMarkdown } from "../markdown-writer";

async function getFileAtCommit(
  sha: string,
  filePath: string,
  cwd: string,
): Promise<string> {
  const result = await $`git show ${sha}:${filePath}`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}

function splitRawDiffByFile(rawDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  const lines = rawDiff.split("\n");
  const headers: { path: string; start: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^diff --git a\/(.+) b\/(.+)$/);
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

export async function check(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  await ensureAuditDir(cwd);

  const fromSha = await readHead(cwd);
  if (!fromSha) {
    console.error(
      "test-verifier: HEAD not initialized. Run `bunx test-verifier init` first.",
    );
    process.exit(1);
  }

  const toSha = await getCurrentCommitSha(cwd);
  if (fromSha === toSha) {
    console.log("test-verifier: no new commits to check.");
    return;
  }

  const diffGlobs = [
    ...config.testGlobs,
    ...config.excludeGlobs.map((g) => `:!${g}`),
  ];
  const rawDiff = await getDiffBetweenCommits(fromSha, toSha, diffGlobs, cwd);

  if (!rawDiff) {
    console.log("test-verifier: no test file changes detected.");
    await writeHead(cwd, toSha);
    return;
  }

  const fileDiffs = parseDiff(rawDiff);
  const rawDiffByFile = splitRawDiffByFile(rawDiff);

  let stubCount = 0;
  let autoApprovedCount = 0;

  for (const fileDiff of fileDiffs) {
    const testFilePath = fileDiff.newPath;

    const beforeContent = await getFileAtCommit(fromSha, fileDiff.oldPath, cwd);
    const afterContent = await getFileAtCommit(toSha, testFilePath, cwd);

    const ruleResult = runRuleEngine({
      filePath: testFilePath,
      beforeContent,
      afterContent,
      diffs: [fileDiff],
      config,
    });

    const prodFiles = await getRelatedProdFiles(toSha, testFilePath, cwd);
    const fileRawDiff = rawDiffByFile.get(testFilePath) ?? "";

    const { filename, content } = generateStubMarkdown({
      ruleResult,
      commit: toSha,
      parentCommit: fromSha,
      rawDiff: fileRawDiff,
      prodFilesRelated: prodFiles,
    });

    const pendingPath = join(statusDir(cwd, "pending"), filename);
    await writeFile(pendingPath, content);
    stubCount++;

    const isAutoApproved = (config.policy.autoApprove as string[]).includes(
      ruleResult.overallSeverity,
    );
    if (isAutoApproved) {
      await moveToApproved(cwd, filename);
      autoApprovedCount++;
    }

    const label = isAutoApproved ? " (auto-approved)" : "";
    console.log(`  ${ruleResult.overallSeverity} ${testFilePath}${label}`);
  }

  await writeHead(cwd, toSha);
  console.log(
    `test-verifier: ${stubCount} file(s) analyzed, ${autoApprovedCount} auto-approved.`,
  );
}
