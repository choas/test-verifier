import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { StubStatus } from "./types";

const AUDIT_DIR = ".test-verifier";
const HEAD_FILE = "HEAD";
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
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function writeHead(repoRoot: string, sha: string): Promise<void> {
  await mkdir(join(repoRoot, AUDIT_DIR), { recursive: true });
  await writeFile(join(repoRoot, AUDIT_DIR, HEAD_FILE), sha + "\n");
}

export async function listByStatus(repoRoot: string, status: StubStatus): Promise<string[]> {
  try {
    const entries = await readdir(statusDir(repoRoot, status));
    return entries.filter((e) => !e.startsWith(".")).sort();
  } catch {
    return [];
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
  const src = join(statusDir(repoRoot, from), filename);
  const dest = join(statusDir(repoRoot, to), filename);
  await mkdir(statusDir(repoRoot, to), { recursive: true });
  await rename(src, dest);
  return dest;
}
