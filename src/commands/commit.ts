import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { auditDir } from "../audit-folder";
import { parseMarkdown } from "../markdown-reader";
import type { Severity, StubStatus } from "../types";

interface AuditChange {
  added: string[];
  modified: string[];
  deleted: string[];
}

async function getAuditDirChanges(cwd: string): Promise<AuditChange> {
  const dir = auditDir(cwd);
  const result = await $`git status --porcelain ${dir}`.cwd(cwd).quiet().nothrow();
  if (result.exitCode !== 0) return { added: [], modified: [], deleted: [] };

  const lines = result.stdout.toString().trim().split("\n").filter(Boolean);
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const line of lines) {
    const status = line.slice(0, 2).trim();
    const file = line.slice(3);
    if (file.match(/\.sqlite(-shm|-wal)?$/)) continue;
    if (status === "??" || status === "A") {
      added.push(file);
    } else if (status === "M") {
      modified.push(file);
    } else if (status === "D") {
      deleted.push(file);
    }
  }

  return { added, modified, deleted };
}

interface FindingSummary {
  testFile: string;
  severity: Severity;
  status: StubStatus;
  findingCount: number;
}

async function summarizeFinding(filePath: string, cwd: string): Promise<FindingSummary | null> {
  try {
    const content = await readFile(join(cwd, filePath), "utf-8");
    const parsed = parseMarkdown(content);
    return {
      testFile: parsed.stub.test_file,
      severity: parsed.stub.severity,
      status: parsed.stub.status,
      findingCount: parsed.findings.length,
    };
  } catch {
    return null;
  }
}

function categorizeByFolder(files: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const f of files) {
    const parts = f.split("/");
    const folder = parts.length >= 3 ? parts[1] : "root";
    if (!result[folder]) result[folder] = [];
    result[folder].push(f);
  }
  return result;
}

function buildCommitMessage(changes: AuditChange, summaries: FindingSummary[]): string {
  const parts: string[] = [];
  const allChanged = [...changes.added, ...changes.modified, ...changes.deleted];

  const bySeverity: Record<string, number> = {};
  for (const s of summaries) {
    bySeverity[s.severity] = (bySeverity[s.severity] || 0) + 1;
  }

  const byStatus: Record<string, number> = {};
  for (const s of summaries) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }

  const headChanged = allChanged.some((f) => f.endsWith("/HEAD"));
  const hasFindings = summaries.length > 0;

  if (hasFindings) {
    const severities = Object.entries(bySeverity)
      .sort(([a], [b]) => severityOrder(a) - severityOrder(b))
      .map(([sev, count]) => `${count} ${sev}`)
      .join(", ");

    parts.push(`test-verifier: update audit trail (${severities})`);
  } else if (headChanged && allChanged.length === 1) {
    parts.push("test-verifier: update HEAD pointer");
  } else {
    parts.push("test-verifier: update audit trail");
  }

  parts.push("");

  if (changes.added.length > 0) {
    const byFolder = categorizeByFolder(changes.added);
    for (const [folder, files] of Object.entries(byFolder)) {
      if (folder === "pending" || folder === "approved" || folder === "rejected") {
        parts.push(`${files.length} finding(s) added to ${folder}/`);
      } else if (folder === "keys") {
        parts.push(`${files.length} key(s) added`);
      }
    }
  }

  if (changes.modified.length > 0) {
    const byFolder = categorizeByFolder(changes.modified);
    for (const [folder, files] of Object.entries(byFolder)) {
      if (folder === "root") {
        for (const f of files) {
          if (f.endsWith("HEAD")) parts.push("HEAD pointer updated");
        }
      } else {
        parts.push(`${files.length} finding(s) updated in ${folder}/`);
      }
    }
  }

  if (changes.deleted.length > 0) {
    const byFolder = categorizeByFolder(changes.deleted);
    for (const [folder, files] of Object.entries(byFolder)) {
      parts.push(`${files.length} finding(s) removed from ${folder}/`);
    }
  }

  if (summaries.length > 0) {
    parts.push("");
    const testFiles = [...new Set(summaries.map((s) => s.testFile))];
    parts.push("Affected test files:");
    for (const tf of testFiles) {
      parts.push(`  - ${tf}`);
    }
  }

  return parts.join("\n").trimEnd();
}

function severityOrder(s: string): number {
  switch (s) {
    case "CRITICAL":
      return 0;
    case "SUSPICIOUS":
      return 1;
    case "LOW":
      return 2;
    case "SAFE":
      return 3;
    default:
      return 4;
  }
}

export async function commit(cwd: string = process.cwd()): Promise<void> {
  const changes = await getAuditDirChanges(cwd);
  const allFiles = [...changes.added, ...changes.modified, ...changes.deleted];

  if (allFiles.length === 0) {
    console.log("test-verifier: no audit trail changes to commit.");
    return;
  }

  const findingFiles = [...changes.added, ...changes.modified].filter(
    (f) => f.endsWith(".md") && !f.endsWith("HEAD"),
  );

  const summaries: FindingSummary[] = [];
  for (const f of findingFiles) {
    const s = await summarizeFinding(f, cwd);
    if (s) summaries.push(s);
  }

  const message = buildCommitMessage(changes, summaries);

  const dir = auditDir(cwd);
  const addResult = await $`git add ${dir} -- ':!*.sqlite' ':!*.sqlite-shm' ':!*.sqlite-wal'`
    .cwd(cwd)
    .quiet()
    .nothrow();
  if (addResult.exitCode !== 0) {
    console.error(`Failed to stage .test-verifier/: ${addResult.stderr.toString()}`);
    process.exit(1);
  }

  const commitResult = await $`git commit -m ${message}`.cwd(cwd).quiet().nothrow();
  if (commitResult.exitCode !== 0) {
    const stderr = commitResult.stderr.toString();
    if (stderr.includes("nothing to commit")) {
      console.log("test-verifier: audit trail already up to date.");
      return;
    }
    console.error(`Commit failed: ${stderr}`);
    process.exit(1);
  }

  console.log(commitResult.stdout.toString().trim());
  console.log(`\ntest-verifier: committed audit trail changes.`);
}
