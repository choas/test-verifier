import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  listByStatus,
  statusDir,
  auditDir,
  moveToApproved,
  moveToRejected,
  moveToNeedsFix,
} from "../audit-folder";
import { parseMarkdown, type ParsedMarkdown } from "../markdown-reader";
import { VerificationStore } from "../db/verification-store";
import { signFile } from "../crypto/sign-verify";
import { loadSigningContext } from "./shared";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BG_RED = "\x1b[41m";
const BG_GREEN = "\x1b[42m";
const _BG_YELLOW = "\x1b[43m";

const SEVERITY_STYLE: Record<string, string> = {
  SAFE: `${GREEN}SAFE${RESET}`,
  LOW: `${CYAN}LOW${RESET}`,
  SUSPICIOUS: `${YELLOW}SUSPICIOUS${RESET}`,
  CRITICAL: `${RED}${BOLD}CRITICAL${RESET}`,
};

function colorSeverity(severity: string): string {
  return SEVERITY_STYLE[severity] ?? severity;
}

function colorDiffLine(line: string): string {
  if (line.startsWith("+")) return `${GREEN}${line}${RESET}`;
  if (line.startsWith("-")) return `${RED}${line}${RESET}`;
  if (line.startsWith("@@")) return `${CYAN}${line}${RESET}`;
  return line;
}

interface ReviewableFile {
  filename: string;
  filePath: string;
  parsed: ParsedMarkdown;
  raw: string;
}

function displayFile(index: number, total: number, file: ReviewableFile): void {
  const { parsed } = file;
  const ruler = "─".repeat(60);

  console.log(`\n${DIM}${ruler}${RESET}`);
  console.log(`${BOLD}[${index + 1}/${total}]${RESET} ${parsed.stub.test_file}`);
  console.log(
    `Severity: ${colorSeverity(parsed.stub.severity)}  │  Commit: ${DIM}${parsed.stub.commit.slice(0, 7)}${RESET}  │  ${DIM}${parsed.stub.created_at}${RESET}`,
  );
  console.log(`${DIM}${ruler}${RESET}`);

  console.log(`\n${BOLD}Findings${RESET}`);
  if (parsed.findings.length === 0) {
    console.log(`  ${DIM}No findings.${RESET}`);
  } else {
    for (const f of parsed.findings) {
      console.log(`  ${colorSeverity(f.severity)} ${f.message}`);
    }
  }

  console.log(`\n${BOLD}Diff${RESET}`);
  if (parsed.diff) {
    for (const line of parsed.diff.split("\n")) {
      console.log(`  ${colorDiffLine(line)}`);
    }
  } else {
    console.log(`  ${DIM}(no diff)${RESET}`);
  }

  console.log(`\n${BOLD}Analysis${RESET}`);
  if (parsed.analysis && !parsed.analysis.startsWith("(Pending")) {
    console.log(parsed.analysis);
  } else {
    console.log(`  ${DIM}(no analysis)${RESET}`);
  }
}

export async function review(cwd: string = process.cwd()): Promise<void> {
  const pendingFiles = await listByStatus(cwd, "pending");

  if (pendingFiles.length === 0) {
    console.log("test-verifier: no pending files to review.");
    return;
  }

  const enriched: ReviewableFile[] = [];
  const unenriched: { filename: string; testFile: string }[] = [];

  for (const filename of pendingFiles) {
    const filePath = join(statusDir(cwd, "pending"), filename);
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseMarkdown(raw);

    if (parsed.stub.llm_enriched) {
      enriched.push({ filename, filePath, parsed, raw });
    } else {
      unenriched.push({ filename, testFile: parsed.stub.test_file });
    }
  }

  if (unenriched.length > 0) {
    console.log(
      `${YELLOW}Skipping ${unenriched.length} unenriched stub(s)${RESET} — run \`bunx test-verifier enrich\` first:`,
    );
    for (const { filename, testFile } of unenriched) {
      console.log(`  ${DIM}${testFile}${RESET}  (${filename})`);
    }
  }

  if (enriched.length === 0) {
    console.log("\ntest-verifier: no enriched files available for review.");
    return;
  }

  console.log(`\n${enriched.length} file(s) ready for review.\n`);

  const MAGENTA = "\x1b[35m";
  const BG_MAGENTA = "\x1b[45m";

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const { email, privateKey } = await loadSigningContext(cwd);
  const store = new VerificationStore(auditDir(cwd));

  let approvedCount = 0;
  let rejectedCount = 0;
  let needsFixCount = 0;
  let skippedCount = 0;

  try {
    for (let i = 0; i < enriched.length; i++) {
      const file = enriched[i];

      displayFile(i, enriched.length, file);

      const prev = store.findByTestFile(file.parsed.stub.test_file);
      if (prev.length > 0) {
        const relevantPrev = prev.filter((r) => r.id !== file.parsed.stub.id);
        if (relevantPrev.length > 0) {
          console.log(`\n${DIM}Previous verifications:${RESET}`);
          for (const p of relevantPrev.slice(0, 3)) {
            const statusColor =
              p.status === "needs_fix" ? MAGENTA : p.status === "approved" ? GREEN : RED;
            console.log(`  ${statusColor}[${p.status}]${RESET} ${p.id} (${p.rule})`);
          }
          if (relevantPrev.length > 3) {
            console.log(`  ${DIM}... and ${relevantPrev.length - 3} more${RESET}`);
          }
        }
      }

      let answer = "";
      while (!["a", "r", "f", "s"].includes(answer)) {
        const input = await rl.question(
          `\n${BOLD}[a]${RESET}pprove / ${BOLD}[r]${RESET}eject / ${BOLD}[f]${RESET} needs-fix / ${BOLD}[s]${RESET}kip ? `,
        );
        answer = input.trim().toLowerCase().charAt(0);
      }

      switch (answer) {
        case "a": {
          const rationale =
            (await rl.question(`  ${DIM}Rationale:${RESET} `)).trim() ||
            "approved via interactive review";
          const updated = signFile(privateKey, file.raw, "approved", email, rationale);
          await writeFile(file.filePath, updated);
          await moveToApproved(cwd, file.filename);
          store.updateStatus(file.parsed.stub.id, "approved", email, rationale);
          approvedCount++;
          console.log(`  ${BG_GREEN}${BOLD} APPROVED ${RESET}`);
          break;
        }
        case "r": {
          const rationale =
            (await rl.question(`  ${DIM}Rationale:${RESET} `)).trim() ||
            "rejected via interactive review";
          const updated = signFile(privateKey, file.raw, "rejected", email, rationale);
          await writeFile(file.filePath, updated);
          await moveToRejected(cwd, file.filename);
          store.updateStatus(file.parsed.stub.id, "rejected", email, rationale);
          rejectedCount++;
          console.log(`  ${BG_RED}${BOLD} REJECTED ${RESET}`);
          break;
        }
        case "f": {
          const rationale =
            (await rl.question(`  ${DIM}Rationale:${RESET} `)).trim() ||
            "needs fix via interactive review";
          const updated = signFile(privateKey, file.raw, "needs_fix", email, rationale);
          await writeFile(file.filePath, updated);
          await moveToNeedsFix(cwd, file.filename);
          store.updateStatus(file.parsed.stub.id, "needs_fix", email, rationale);
          needsFixCount++;
          console.log(`  ${BG_MAGENTA}${BOLD} NEEDS FIX ${RESET}`);
          break;
        }
        case "s": {
          skippedCount++;
          console.log(`  ${DIM}Skipped${RESET}`);
          break;
        }
      }
    }
  } finally {
    rl.close();
    store.close();
  }

  const parts = [`${approvedCount} approved`, `${rejectedCount} rejected`];
  if (needsFixCount > 0) parts.push(`${needsFixCount} needs-fix`);
  parts.push(`${skippedCount} skipped`);
  console.log(`\ntest-verifier: ${parts.join(", ")}.`);
}
