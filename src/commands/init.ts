import { getCurrentCommitSha, getGitEmail } from "../git";
import { ensureAuditDir, writeHead } from "../audit-folder";
import { initKeys, publicKeyPath } from "../crypto/keys";

export async function init(cwd: string = process.cwd()): Promise<void> {
  const email = await getGitEmail(cwd);
  const sha = await getCurrentCommitSha(cwd);

  await ensureAuditDir(cwd);
  await writeHead(cwd, sha);
  console.log(`Wrote HEAD: ${sha}`);

  let keysResult: { repoId: string; created: boolean };
  try {
    keysResult = await initKeys(cwd, email);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("No git remote 'origin' found")) {
      console.log(
        "No git remote 'origin' found — skipping keypair generation.\nAdd a remote and re-run: git remote add origin <url> && bunx test-verifier init",
      );
      return;
    }
    throw err;
  }

  if (keysResult.created) {
    const pubPath = publicKeyPath(cwd, email);
    console.log(`Generated Ed25519 keypair (repo-id: ${keysResult.repoId})`);
    console.log(`Public key written to: ${pubPath}`);
    console.log(
      `\nPlease commit the public key:\n  git add ${pubPath} && git commit -m "test-verifier: add public key for ${email}"`,
    );
  } else {
    console.log(
      `Keypair already exists for this repo (repo-id: ${keysResult.repoId})`,
    );
  }
}
