import { auditDir } from "../audit-folder";
import { VerificationStore, type VerificationRecord } from "../db/verification-store";

const STATUS_COLORS: Record<string, string> = {
  pending: "\x1b[33m",
  approved: "\x1b[32m",
  rejected: "\x1b[31m",
  needs_fix: "\x1b[35m",
  resolved: "\x1b[36m",
};
const RESET = "\x1b[0m";

function formatRecord(r: VerificationRecord, indent = ""): string {
  const color = STATUS_COLORS[r.status] ?? "";
  const lines: string[] = [];
  lines.push(`${indent}${color}[${r.status.toUpperCase()}]${RESET} ${r.id}`);
  lines.push(`${indent}  severity: ${r.severity}  rule: ${r.rule}`);
  lines.push(`${indent}  commit: ${r.commit}  created: ${r.createdAt}`);
  if (r.testFunctions.length > 0) {
    lines.push(`${indent}  tests: ${r.testFunctions.join(", ")}`);
  }
  if (r.reviewer) {
    lines.push(`${indent}  reviewer: ${r.reviewer}`);
  }
  if (r.rationale) {
    lines.push(`${indent}  rationale: ${r.rationale}`);
  }
  if (r.parentVerificationId) {
    lines.push(`${indent}  parent: ${r.parentVerificationId}`);
  }
  return lines.join("\n");
}

export async function history(cwd: string = process.cwd()): Promise<void> {
  const testFile = Bun.argv[3];
  if (!testFile) {
    console.error("Usage: test-verifier history <test-file> [--function <name>]");
    process.exit(1);
  }

  const funcIdx = Bun.argv.indexOf("--function");
  const testFunction = funcIdx !== -1 ? Bun.argv[funcIdx + 1] : undefined;

  const store = new VerificationStore(auditDir(cwd));

  try {
    let records: VerificationRecord[];
    if (testFunction) {
      records = store.findByTestFileAndFunction(testFile, testFunction);
    } else {
      records = store.findByTestFile(testFile);
    }

    if (records.length === 0) {
      const label = testFunction
        ? `${testFile} > "${testFunction}"`
        : testFile;
      console.log(`No verification history for ${label}.`);
      return;
    }

    const header = testFunction
      ? `Verification history for ${testFile} > "${testFunction}"`
      : `Verification history for ${testFile}`;
    console.log(header);
    console.log("─".repeat(header.length));
    console.log();

    for (const record of records) {
      console.log(formatRecord(record));

      const children = store.getChildren(record.id);
      for (const child of children) {
        if (!records.some((r) => r.id === child.id)) {
          console.log(formatRecord(child, "  └─ "));
        }
      }

      console.log();
    }

    const summary = store.summary();
    const parts: string[] = [];
    for (const [status, count] of Object.entries(summary)) {
      if (count > 0) {
        const color = STATUS_COLORS[status] ?? "";
        parts.push(`${color}${status}: ${count}${RESET}`);
      }
    }
    if (parts.length > 0) {
      console.log(`Overall: ${parts.join("  ")}`);
    }
  } finally {
    store.close();
  }
}
