import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { statusDir, moveToRejected, listByStatus, auditDir } from "../audit-folder";
import { getOriginUrl, getRepoId, loadPrivateKey } from "../crypto/keys";
import { sign } from "../crypto/sign-verify";
import { parseFrontMatter } from "../crypto/sign-verify";
import { VerificationStore } from "../db/verification-store";

async function getGitEmail(cwd: string): Promise<string> {
  const result = await $`git config user.email`.cwd(cwd).quiet().nothrow();
  const email = result.stdout.toString().trim();
  if (result.exitCode !== 0 || !email) {
    throw new Error(
      "git user.email is not configured. Run: git config user.email you@example.com",
    );
  }
  return email;
}

export async function reject(cwd: string = process.cwd()): Promise<void> {
  const findingId = Bun.argv[3];
  if (!findingId) {
    console.error("Usage: test-verifier reject <finding-id> --rationale <text>");
    process.exit(1);
  }

  const rationaleIdx = Bun.argv.indexOf("--rationale");
  if (rationaleIdx === -1 || !Bun.argv[rationaleIdx + 1]) {
    console.error("Missing --rationale flag.");
    process.exit(1);
  }
  const rationale = Bun.argv[rationaleIdx + 1];

  const pending = await listByStatus(cwd, "pending");
  const filename = pending.find(
    (f) => f === `${findingId}.md` || f.replace(/\.md$/, "") === findingId,
  );
  if (!filename) {
    console.error(`No pending finding with id '${findingId}'.`);
    console.error(`Pending files: ${pending.length === 0 ? "(none)" : pending.join(", ")}`);
    process.exit(1);
  }

  const filePath = join(statusDir(cwd, "pending"), filename);
  const content = await readFile(filePath, "utf-8");

  const email = await getGitEmail(cwd);
  const originUrl = await getOriginUrl(cwd);
  const repoId = getRepoId(originUrl);
  const privateKey = await loadPrivateKey(repoId);
  if (!privateKey) {
    console.error(
      `No private key found for this repo (repo-id: ${repoId}). Run 'bunx test-verifier init' first.`,
    );
    process.exit(1);
  }

  const fm = parseFrontMatter(content);
  const diffHash = fm["diff_hash"];
  if (!diffHash) throw new Error("No diff_hash in front matter");

  const decisionText = `rejected by ${email}\nrationale: ${rationale}`;
  const sig = sign(privateKey, { diffHash, decisionText });

  const marker = "## Decision";
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error("No Decision section found");

  const before = content.slice(0, idx + marker.length);
  const decision = `\n\n${decisionText}\nsignature: ed25519:${sig}\n`;
  const signed = before + decision;
  const updated = signed.replace(/^status: pending$/m, "status: rejected");

  await writeFile(filePath, updated);
  const dest = await moveToRejected(cwd, filename);

  const store = new VerificationStore(auditDir(cwd));
  const stubId = fm["id"] || findingId;
  store.updateStatus(stubId, "rejected", email, rationale);
  store.close();

  console.log(`Rejected: ${findingId}`);
  console.log(`  Moved to: ${dest}`);
}
