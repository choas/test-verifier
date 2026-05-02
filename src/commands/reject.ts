import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { moveToRejected, auditDir } from "../audit-folder";
import { signFile, parseFrontMatter } from "../crypto/sign-verify";
import { parseMarkdown } from "../markdown-reader";
import { VerificationStore } from "../db/verification-store";
import { loadSigningContext, findPendingFile } from "./shared";

export async function reject(cwd: string = process.cwd()): Promise<void> {
  const findingId = Bun.argv[3];
  if (!findingId) {
    console.error("Usage: test-verifier reject <finding-id> --rationale <text>");
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

  const { filename, filePath, content } = await findPendingFile(cwd, findingId);
  parseMarkdown(content);
  const { email, privateKey } = await loadSigningContext(cwd);

  const updated = signFile(privateKey, content, "rejected", email, rationale);

  await writeFile(filePath, updated);
  const dest = await moveToRejected(cwd, filename);

  const store = new VerificationStore(auditDir(cwd));
  try {
    const fm = parseFrontMatter(content);
    const stubId = fm.id || findingId;
    store.updateStatus(stubId, "rejected", email, rationale);
  } finally {
    store.close();
  }

  console.log(`Rejected: ${findingId}`);
  console.log(`  Moved to: ${dest}`);
}
