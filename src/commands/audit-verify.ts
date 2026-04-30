import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { listByStatus, statusDir } from "../audit-folder";
import { loadPublicKey } from "../crypto/keys";
import { verifyFile, parseDecisionSection } from "../crypto/sign-verify";
import type { StubStatus } from "../types";

interface AuditVerifyOptions {
  noPending: boolean;
  noRejected: boolean;
  signatures: boolean;
}

const APPROVER_RE = /^(?:approved|rejected) by (.+)$/m;

function extractApprover(fileContent: string): string | null {
  const decision = parseDecisionSection(fileContent);
  const match = decision.match(APPROVER_RE);
  return match ? match[1].trim() : null;
}

export function parseFlags(argv: string[]): AuditVerifyOptions {
  return {
    noPending: argv.includes("--no-pending"),
    noRejected: argv.includes("--no-rejected"),
    signatures: argv.includes("--signatures"),
  };
}

export async function auditVerify(options: AuditVerifyOptions): Promise<void> {
  const repoRoot = process.cwd();
  let failures = 0;

  if (options.noPending) {
    const pending = await listByStatus(repoRoot, "pending");
    if (pending.length > 0) {
      console.error(`FAIL: ${pending.length} pending file(s) exist`);
      for (const f of pending) {
        console.error(`  ${f}`);
      }
      failures += pending.length;
    }
  }

  if (options.noRejected) {
    const rejected = await listByStatus(repoRoot, "rejected");
    if (rejected.length > 0) {
      console.error(`FAIL: ${rejected.length} rejected file(s) exist`);
      for (const f of rejected) {
        console.error(`  ${f}`);
      }
      failures += rejected.length;
    }
  }

  if (options.signatures) {
    const statuses: StubStatus[] = ["approved", "rejected"];
    for (const status of statuses) {
      const files = await listByStatus(repoRoot, status);
      for (const filename of files) {
        const filePath = join(statusDir(repoRoot, status), filename);
        const content = await readFile(filePath, "utf-8");

        let approver: string | null;
        try {
          approver = extractApprover(content);
        } catch {
          console.error(`FAIL: ${status}/${filename}: missing Decision section`);
          failures++;
          continue;
        }

        if (!approver) {
          console.error(`FAIL: ${status}/${filename}: no approver found in Decision section`);
          failures++;
          continue;
        }

        const publicKey = await loadPublicKey(repoRoot, approver);
        if (!publicKey) {
          console.error(`FAIL: ${status}/${filename}: public key not found for ${approver}`);
          failures++;
          continue;
        }

        try {
          const valid = verifyFile(publicKey, content);
          if (!valid) {
            console.error(`FAIL: ${status}/${filename}: invalid signature`);
            failures++;
          } else {
            console.log(`OK: ${status}/${filename}`);
          }
        } catch (err) {
          console.error(`FAIL: ${status}/${filename}: ${(err as Error).message}`);
          failures++;
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`\naudit verify: ${failures} failure(s)`);
    process.exit(1);
  }

  console.log("audit verify: all checks passed");
}
