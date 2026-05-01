import { readFile, writeFile, mkdir, rename, readdir, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { StubStatus } from "./types";
import { assertSafeFilename, assertValidSha } from "./path-guard";

const AUDIT_DIR = ".test-verifier";
const HEAD_FILE = "HEAD";
const SHA_OR_LABEL_RE = /^[A-Z_]+$|^[0-9a-f]{4,64}$/;
const STATUS_DIRS: readonly StubStatus[] = ["pending", "approved", "rejected", "needs_fix", "resolved"] as const;
const EXTRA_DIRS = ["archive", "keys"] as const;

export function auditDir(repoRoot: string): string {
  return join(repoRoot, AUDIT_DIR);
}

export function statusDir(repoRoot: string, status: StubStatus): string {
  return join(repoRoot, AUDIT_DIR, status);
}

export async function ensureAuditDir(repoRoot: string): Promise<void> {
  const dirs = [...STATUS_DIRS, ...EXTRA_DIRS];
  await Promise.all(
    dirs.map((d) => mkdir(join(repoRoot, AUDIT_DIR, d), { recursive: true })),
  );
}

export async function readHead(repoRoot: string): Promise<string | null> {
  try {
    const content = await readFile(join(repoRoot, AUDIT_DIR, HEAD_FILE), "utf-8");
    const trimmed = content.trim();
    if (!trimmed) return null;
    if (!SHA_OR_LABEL_RE.test(trimmed)) {
      throw new Error(`Invalid HEAD value (expected hex SHA or label): ${trimmed}`);
    }
    return trimmed;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid HEAD")) throw err;
    return null;
  }
}

export async function writeHead(repoRoot: string, sha: string): Promise<void> {
  if (!SHA_OR_LABEL_RE.test(sha)) {
    throw new Error(`Refusing to write invalid SHA/label to HEAD: ${sha}`);
  }
  await mkdir(join(repoRoot, AUDIT_DIR), { recursive: true });
  await writeFile(join(repoRoot, AUDIT_DIR, HEAD_FILE), sha + "\n");
}

export async function listByStatus(repoRoot: string, status: StubStatus): Promise<string[]> {
  try {
    const dir = statusDir(repoRoot, status);
    const entries = await readdir(dir);
    const safe: string[] = [];
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      const entryPath = join(dir, e);
      const info = await lstat(entryPath);
      if (info.isSymbolicLink()) continue;
      safe.push(e);
    }
    return safe.sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function moveToApproved(repoRoot: string, filename: string): Promise<string> {
  return moveFile(repoRoot, filename, "pending", "approved");
}

export async function moveToRejected(repoRoot: string, filename: string): Promise<string> {
  return moveFile(repoRoot, filename, "pending", "rejected");
}

export async function moveToNeedsFix(repoRoot: string, filename: string): Promise<string> {
  return moveFile(repoRoot, filename, "pending", "needs_fix");
}

export async function moveToResolved(repoRoot: string, filename: string, from: StubStatus = "needs_fix"): Promise<string> {
  return moveFile(repoRoot, filename, from, "resolved");
}

async function moveFile(
  repoRoot: string,
  filename: string,
  from: StubStatus,
  to: StubStatus,
): Promise<string> {
  assertSafeFilename(filename);
  const src = join(statusDir(repoRoot, from), filename);
  const info = await lstat(src);
  if (info.isSymbolicLink()) {
    throw new Error(`Refusing to move symlink: ${src}`);
  }
  const dest = join(statusDir(repoRoot, to), filename);
  await mkdir(statusDir(repoRoot, to), { recursive: true });
  await rename(src, dest);
  return dest;
}

export async function pruneOldFiles(
  dir: string,
  maxAgeDays: number,
): Promise<number> {
  let removed = 0;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const filePath = join(dir, entry);
    try {
      const info = await lstat(filePath);
      if (info.isSymbolicLink()) continue;
      if (info.isFile() && info.mtimeMs < cutoff) {
        await unlink(filePath);
        removed++;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`  warn: failed to prune ${entry}: ${(err as Error).message}`);
      }
    }
  }

  return removed;
}
