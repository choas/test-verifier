import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentCommitSha, getGitEmail } from "../git";
import { ensureAuditDir, writeHead } from "../audit-folder";
import { initKeys, publicKeyPath } from "../crypto/keys";
import { configPath, configSchema } from "../config";

const GITIGNORE_ENTRIES = [
  ".test-verifier/*.sqlite",
  ".test-verifier/*.sqlite-shm",
  ".test-verifier/*.sqlite-wal",
];

export async function init(cwd: string = process.cwd()): Promise<void> {
  const email = await getGitEmail(cwd);
  const sha = await getCurrentCommitSha(cwd);

  await ensureAuditDir(cwd);
  await ensureConfigJson(cwd);
  await ensureGitignore(cwd);

  if (sha) {
    await writeHead(cwd, sha);
    console.log(`Wrote HEAD: ${sha}`);
  } else {
    console.log("No commits yet — skipping HEAD write. Re-run after your first commit.");
  }

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

async function ensureConfigJson(cwd: string): Promise<void> {
  const cfgPath = configPath(cwd);
  const file = Bun.file(cfgPath);
  if (await file.exists()) return;

  const defaults = configSchema.parse({});
  await writeFile(cfgPath, JSON.stringify(defaults, null, 2) + "\n");
  console.log("Created .test-verifier/config.json with default settings");
}

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");
  let content = "";
  try {
    content = await readFile(gitignorePath, "utf-8");
  } catch {
    // no .gitignore yet
  }

  const lines = content.split("\n");
  const missing = GITIGNORE_ENTRIES.filter((entry) => !lines.includes(entry));
  if (missing.length === 0) return;

  const suffix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await writeFile(gitignorePath, content + suffix + missing.join("\n") + "\n");
  console.log("Updated .gitignore with sqlite database patterns");
}
