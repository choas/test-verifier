import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { moveToApproved, moveFile, auditDir } from "../audit-folder";
import { signFile } from "../crypto/sign-verify";
import { parseMarkdown } from "../markdown-reader";
import { VerificationStore } from "../db/verification-store";
import { loadSigningContext, findFileByStatus, resolveDbId } from "./shared";

export async function approve(cwd: string = process.cwd()): Promise<void> {
  const findingId = Bun.argv[3];
  if (!findingId) {
    console.error("Usage: test-verifier approve <finding-id> --rationale <text>");
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

  const fileResult = await findFileByStatus(cwd, findingId, ["pending", "needs_fix"]);

  if (fileResult) {
    const { filename, content, status } = fileResult;
    const { stub } = parseMarkdown(content);
    const { email, privateKey } = await loadSigningContext(cwd);

    const updated = signFile(privateKey, content, "approved", email, rationale);

    const store = new VerificationStore(auditDir(cwd));
    try {
      store.updateStatus(stub.id, "approved", email, rationale);
    } finally {
      store.close();
    }

    const dest =
      status === "pending"
        ? await moveToApproved(cwd, filename)
        : await moveFile(cwd, filename, "needs_fix", "approved");
    await writeFile(dest, updated);

    console.log(`Approved: ${stub.id}`);
    console.log(`  Moved to: ${dest}`);
  } else {
    const store = new VerificationStore(auditDir(cwd));
    try {
      const dbId = resolveDbId(store, findingId, ["pending", "needs_fix"]);
      if (!dbId) {
        console.error(`No finding with id '${findingId}' in pending, needs_fix.`);
        process.exit(1);
      }
      const email = (await loadSigningContext(cwd)).email;
      store.updateStatus(dbId, "approved", email, rationale);
      console.log(`Approved (db-only, file was missing): ${dbId}`);
    } finally {
      store.close();
    }
  }
}
