import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { statusDir, moveToNeedsFix, auditDir, listByStatus } from "../audit-folder";
import { signFile, parseFrontMatter } from "../crypto/sign-verify";
import { parseMarkdown } from "../markdown-reader";
import { VerificationStore } from "../db/verification-store";
import { loadSigningContext, findPendingFile } from "./shared";

async function markOneNeedsFix(
  cwd: string,
  filename: string,
  rationale: string,
  email: string,
  privateKey: string,
  store: VerificationStore,
): Promise<string> {
  const filePath = join(statusDir(cwd, "pending"), filename);
  const content = await readFile(filePath, "utf-8");
  parseMarkdown(content);

  const updated = signFile(privateKey, content, "needs_fix", email, rationale);

  const fm = parseFrontMatter(content);
  const stubId = fm.id || filename.replace(/\.md$/, "");
  store.updateStatus(stubId, "needs_fix", email, rationale);

  const dest = await moveToNeedsFix(cwd, filename);
  await writeFile(dest, updated);

  return dest;
}

export async function needsFix(cwd: string = process.cwd()): Promise<void> {
  const allFlag = Bun.argv.includes("--all");
  const findingId = Bun.argv.slice(3).find((arg) => !arg.startsWith("-"));

  if (allFlag && findingId) {
    console.error("Error: Cannot use --all and a specific finding ID simultaneously.");
    process.exit(1);
  }

  if (!allFlag && !findingId) {
    console.error("Usage: test-verifier needs-fix <finding-id> --rationale <text>");
    console.error("       test-verifier needs-fix --all --rationale <text>");
    process.exit(1);
  }

  let rationale: string;
  const rationaleIdx = Bun.argv.indexOf("--rationale");
  if (rationaleIdx !== -1 && Bun.argv[rationaleIdx + 1]) {
    rationale = Bun.argv[rationaleIdx + 1];
  } else {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rationale = await rl.question("Rationale: ");
    rl.close();
    if (!rationale.trim()) {
      console.error("Rationale cannot be empty.");
      process.exit(1);
    }
  }

  let pendingFiles: string[] = [];
  if (allFlag) {
    pendingFiles = await listByStatus(cwd, "pending");
    if (pendingFiles.length === 0) {
      console.log("No pending findings to mark as needs-fix.");
      return;
    }
  }

  const { email, privateKey } = await loadSigningContext(cwd);

  const store = new VerificationStore(auditDir(cwd));
  try {
    if (allFlag) {
      let count = 0;
      for (const filename of pendingFiles) {
        const dest = await markOneNeedsFix(cwd, filename, rationale, email, privateKey, store);
        const id = filename.replace(/\.md$/, "");
        console.log(`Needs fix: ${id}`);
        console.log(`  Moved to: ${dest}`);
        count++;
      }
      console.log(`\n${count} finding(s) marked as needs-fix.`);
      console.log(`Run 'test-verifier check' after fixing to auto-resolve.`);
      return;
    }

    const { filename } = await findPendingFile(cwd, findingId as string);
    const dest = await markOneNeedsFix(cwd, filename, rationale, email, privateKey, store);

    console.log(`Needs fix: ${findingId}`);
    console.log(`  Moved to: ${dest}`);
    console.log(`  This finding will be tracked until the issue is resolved.`);
    console.log(`  Run 'test-verifier check' after fixing to auto-resolve.`);
  } finally {
    store.close();
  }
}
