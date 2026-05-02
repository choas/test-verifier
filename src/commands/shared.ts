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
  const strippedId = findingId.replace(/^tv_/, "");
  const filename = pending.find((f) => {
    const base = f.replace(/\.md$/, "");
    return (
      f === `${findingId}.md` ||
      base === findingId ||
      f === `${strippedId}.md` ||
      base === strippedId
    );
  });
  if (!filename) {
    console.error(`No pending finding with id '${findingId}'.`);
    console.error(
      `Pending files: ${pending.length === 0 ? "(none)" : pending.join(", ")}`,
    );
    process.exit(1);
  }
  const filePath = join(statusDir(cwd, "pending"), filename);
  const content = await readFile(filePath, "utf-8");
  return { filename, filePath, content };
}

export type FindableStatus = "pending" | "needs_fix";

export async function findFileByStatus(
  cwd: string,
  findingId: string,
  statuses: FindableStatus[],
): Promise<{
  filename: string;
  filePath: string;
  content: string;
  status: FindableStatus;
}> {
  for (const status of statuses) {
    const files = await listByStatus(cwd, status);
    const strippedId = findingId.replace(/^tv_/, "");
    const filename = files.find((f) => {
      const base = f.replace(/\.md$/, "");
      return (
        f === `${findingId}.md` ||
        base === findingId ||
        f === `${strippedId}.md` ||
        base === strippedId
      );
    });
    if (filename) {
      const filePath = join(statusDir(cwd, status), filename);
      const content = await readFile(filePath, "utf-8");
      return { filename, filePath, content, status };
    }
  }
  const allStatuses = statuses.join(", ");
  console.error(`No finding with id '${findingId}' in ${allStatuses}.`);
  process.exit(1);
}
