import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { statusDir, moveToNeedsFix, listByStatus, auditDir } from "../audit-folder";
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

async function markOneNeedsFix(
  cwd: string,
  filename: string,
  rationale: string,
  email: string,
  privateKey: Uint8Array,
): Promise<string> {
  const filePath = join(statusDir(cwd, "pending"), filename);
  const content = await readFile(filePath, "utf-8");

  const fm = parseFrontMatter(content);
  const diffHash = fm["diff_hash"];
  if (!diffHash) throw new Error(`No diff_hash in front matter for ${filename}`);

  const decisionText = `needs_fix by ${email}\nrationale: ${rationale}`;
  const sig = sign(privateKey, { diffHash, decisionText });

  const marker = "## Decision";
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error(`No Decision section found in ${filename}`);

  const before = content.slice(0, idx + marker.length);
  const decision = `\n\n${decisionText}\nsignature: ed25519:${sig}\n`;
  const signed = before + decision;
  const updated = signed.replace(/^status: pending$/m, "status: needs_fix");

  await writeFile(filePath, updated);
  const dest = await moveToNeedsFix(cwd, filename);

  const store = new VerificationStore(auditDir(cwd));
  const stubId = fm["id"] || filename.replace(/\.md$/, "");
  store.updateStatus(stubId, "needs_fix", email, rationale);
  store.close();

  return dest;
}

export async function needsFix(cwd: string = process.cwd()): Promise<void> {
  const allFlag = Bun.argv.includes("--all");
  const findingId = allFlag ? null : Bun.argv[3];

  if (!allFlag && !findingId) {
    console.error("Usage: test-verifier needs-fix <finding-id> --rationale <text>");
    console.error("       test-verifier needs-fix --all --rationale <text>");
    process.exit(1);
  }

  const rationaleIdx = Bun.argv.indexOf("--rationale");
  if (rationaleIdx === -1 || !Bun.argv[rationaleIdx + 1]) {
    console.error("Missing --rationale flag.");
    process.exit(1);
  }
  const rationale = Bun.argv[rationaleIdx + 1];

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

  const pending = await listByStatus(cwd, "pending");

  if (allFlag) {
    if (pending.length === 0) {
      console.log("No pending findings to mark as needs-fix.");
      return;
    }

    let count = 0;
    for (const filename of pending) {
      const dest = await markOneNeedsFix(cwd, filename, rationale, email, privateKey);
      const id = filename.replace(/\.md$/, "");
      console.log(`Needs fix: ${id}`);
      console.log(`  Moved to: ${dest}`);
      count++;
    }
    console.log(`\n${count} finding(s) marked as needs-fix.`);
    console.log(`Run 'test-verifier check' after fixing to auto-resolve.`);
    return;
  }

  const filename = pending.find(
    (f) => f === `${findingId}.md` || f.replace(/\.md$/, "") === findingId,
  );
  if (!filename) {
    console.error(`No pending finding with id '${findingId}'.`);
    console.error(`Pending files: ${pending.length === 0 ? "(none)" : pending.join(", ")}`);
    process.exit(1);
  }

  const dest = await markOneNeedsFix(cwd, filename, rationale, email, privateKey);

  console.log(`Needs fix: ${findingId}`);
  console.log(`  Moved to: ${dest}`);
  console.log(`  This finding will be tracked until the issue is resolved.`);
  console.log(`  Run 'test-verifier check' after fixing to auto-resolve.`);
}
