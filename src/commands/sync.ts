import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { auditDir, statusDir } from "../audit-folder";
import { VerificationStore, type VerificationRecord } from "../db/verification-store";
import { parseMarkdown, type ParsedFinding } from "../markdown-reader";
import type { StubStatus } from "../types";

const STATUS_DIRS: readonly StubStatus[] = ["pending", "approved", "rejected", "needs_fix", "resolved"];

function deriveRule(findings: ParsedFinding[]): string {
  if (findings.length === 0) return "safe";
  return findings.map((f) => f.severity).join(",");
}

function extractReviewer(decision: string): string | null {
  const match = decision.match(/\*\*Reviewer:\*\*\s*(.+)/);
  return match ? match[1].trim() : null;
}

function extractRationale(decision: string): string | null {
  const match = decision.match(/\*\*Rationale:\*\*\s*(.+)/);
  return match ? match[1].trim() : null;
}

export async function sync(cwd: string = process.cwd()): Promise<void> {
  const dir = auditDir(cwd);
  const store = new VerificationStore(dir);

  let total = 0;
  let errors = 0;

  try {
    for (const status of STATUS_DIRS) {
      let files: string[];
      try {
        files = await readdir(statusDir(cwd, status));
      } catch {
        continue;
      }

      const mdFiles = files.filter((f) => f.endsWith(".md") && !f.startsWith("."));

      for (const filename of mdFiles) {
        const filePath = join(statusDir(cwd, status), filename);
        try {
          const content = await readFile(filePath, "utf-8");
          const parsed = parseMarkdown(content);

          const record: VerificationRecord = {
            id: parsed.stub.id,
            testFile: parsed.stub.test_file,
            testFunctions: parsed.stub.test_functions,
            rule: deriveRule(parsed.findings),
            severity: parsed.stub.severity,
            status: status,
            commit: parsed.stub.commit,
            parentCommit: parsed.stub.parent_commit,
            diffHash: parsed.stub.diff_hash,
            createdAt: parsed.stub.created_at,
            updatedAt: parsed.stub.created_at,
            reviewer: extractReviewer(parsed.decision),
            rationale: extractRationale(parsed.decision),
            parentVerificationId: parsed.stub.parent_verification_id ?? null,
          };

          store.insert(record);
          total++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  skip ${filename}: ${msg}`);
          errors++;
        }
      }
    }
  } finally {
    store.close();
  }

  console.log(`test-verifier: synced ${total} finding(s) into database.`);
  if (errors > 0) {
    console.log(`  ${errors} file(s) skipped due to errors.`);
  }
}
