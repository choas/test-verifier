import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { statusDir, listByStatus } from "../audit-folder";
import { getOriginUrl, getRepoId, loadPrivateKey } from "../crypto/keys";
import { getGitEmail } from "../git";

export { getGitEmail } from "../git";

export interface SigningContext {
  email: string;
  privateKey: string;
}

export async function loadSigningContext(cwd: string): Promise<SigningContext> {
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
  return { email, privateKey };
}

export async function findPendingFile(
  cwd: string,
  findingId: string,
): Promise<{ filename: string; filePath: string; content: string }> {
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
  return { filename, filePath, content };
}
