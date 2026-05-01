import { resolve, relative, isAbsolute, win32, posix } from "node:path";
import { lstat } from "node:fs/promises";

export function assertSafeRelativePath(p: string): void {
  if (p.includes("\0")) {
    throw new Error(`Path contains null byte: ${JSON.stringify(p)}`);
  }
  if (isAbsolute(p) || win32.isAbsolute(p) || posix.isAbsolute(p)) {
    throw new Error(`Absolute path not allowed: ${p}`);
  }
  const segments = p.replace(/\\/g, "/").split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Path traversal (..) not allowed: ${p}`);
    }
  }
}

export function resolveWithinBase(base: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  const resolved = resolve(base, relativePath);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || resolve(base, rel) !== resolved) {
    throw new Error(
      `Path escapes base directory: ${relativePath} (resolved to ${resolved}, base: ${base})`,
    );
  }
  return resolved;
}

export function assertSafeFilename(name: string): void {
  if (name.includes("\0")) {
    throw new Error(`Filename contains null byte`);
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error(`Filename contains path separator: ${name}`);
  }
  if (name === ".." || name === ".") {
    throw new Error(`Invalid filename: ${name}`);
  }
}

const SHA_HEX_RE = /^[0-9a-f]{4,40}$/;

export function assertValidSha(sha: string): void {
  if (!SHA_HEX_RE.test(sha)) {
    throw new Error(`Invalid commit SHA (expected hex string): ${sha}`);
  }
}

export async function assertNotSymlink(filePath: string): Promise<void> {
  const stats = await lstat(filePath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to follow symlink: ${filePath}`);
  }
}
