import { writeFile } from "node:fs/promises";
import { moveToApproved, auditDir } from "../audit-folder";
import { signFile } from "../crypto/sign-verify";
import { parseMarkdown } from "../markdown-reader";
import { VerificationStore } from "../db/verification-store";
import { loadSigningContext, findPendingFile } from "./shared";

export async function approve(cwd: string = process.cwd()): Promise<void> {
  const findingId = Bun.argv[3];
  if (!findingId) {
    console.error("Usage: test-verifier approve <finding-id> --rationale <text>");
    process.exit(1);
  }

  const rationaleIdx = Bun.argv.indexOf("--rationale");
  if (rationaleIdx === -1 || !Bun.argv[rationaleIdx + 1]) {
    console.error("Missing --rationale flag.");
    process.exit(1);
  }
  const rationale = Bun.argv[rationaleIdx + 1];

  const { filename, filePath, content } = await findPendingFile(cwd, findingId);
  parseMarkdown(content);
  const { email, privateKey } = await loadSigningContext(cwd);

  const updated = signFile(privateKey, content, "approved", email, rationale);

  await writeFile(filePath, updated);
  const dest = await moveToApproved(cwd, filename);

  const store = new VerificationStore(auditDir(cwd));
  try {
    store.updateStatus(findingId, "approved", email, rationale);
  } finally {
    store.close();
  }

  console.log(`Approved: ${findingId}`);
  console.log(`  Moved to: ${dest}`);
}
