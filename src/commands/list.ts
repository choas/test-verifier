import { auditDir } from "../audit-folder";
import { VerificationStore, type VerificationRecord } from "../db/verification-store";
import type { StubStatus } from "../types";

const STATUS_COLORS: Record<string, string> = {
  pending: "\x1b[33m",
  approved: "\x1b[32m",
  rejected: "\x1b[31m",
  needs_fix: "\x1b[35m",
  resolved: "\x1b[36m",
};
const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "\x1b[31m",
  SUSPICIOUS: "\x1b[33m",
  LOW: "\x1b[36m",
  SAFE: "\x1b[32m",
};
const RESET = "\x1b[0m";

const NOT_RESOLVED: StubStatus[] = ["pending", "needs_fix", "rejected"];
const ALL_STATUSES: StubStatus[] = ["pending", "needs_fix", "rejected", "approved", "resolved"];

function formatRecord(r: VerificationRecord): string {
  const sc = STATUS_COLORS[r.status] ?? "";
  const sevc = SEVERITY_COLORS[r.severity] ?? "";
  const lines: string[] = [];
  lines.push(`${sc}[${r.status.toUpperCase()}]${RESET} ${sevc}${r.severity}${RESET}  ${r.id}`);
  lines.push(`  file: ${r.testFile}  rule: ${r.rule}`);
  if (r.testFunctions.length > 0) {
    lines.push(`  tests: ${r.testFunctions.join(", ")}`);
  }
  lines.push(`  commit: ${r.commit.slice(0, 8)}  created: ${r.createdAt}`);
  if (r.reviewer) {
    lines.push(`  reviewer: ${r.reviewer}`);
  }
  if (r.rationale) {
    lines.push(`  rationale: ${r.rationale}`);
  }
  return lines.join("\n");
}

export interface ListOptions {
  status?: StubStatus;
  all?: boolean;
}

export async function list(options: ListOptions = {}, cwd: string = process.cwd()): Promise<void> {
  const store = new VerificationStore(auditDir(cwd));

  let statuses: StubStatus[];
  if (options.status) {
    statuses = [options.status];
  } else if (options.all) {
    statuses = ALL_STATUSES;
  } else {
    statuses = NOT_RESOLVED;
  }

  const records: VerificationRecord[] = [];
  for (const s of statuses) {
    records.push(...store.findByStatus(s));
  }

  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (records.length === 0) {
    const label = options.status
      ? `No findings with status "${options.status}".`
      : options.all
        ? "No findings."
        : "No unresolved findings.";
    console.log(label);
    store.close();
    return;
  }

  const header = options.status
    ? `Findings with status "${options.status}" (${records.length})`
    : options.all
      ? `All findings (${records.length})`
      : `Unresolved findings (${records.length})`;
  console.log(header);
  console.log("─".repeat(header.length));
  console.log();

  for (const record of records) {
    console.log(formatRecord(record));
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
    console.log(`Summary: ${parts.join("  ")}`);
  }

  store.close();
}
