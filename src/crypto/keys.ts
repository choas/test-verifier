import { createHash, generateKeyPairSync } from "node:crypto";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { assertSafeFilename } from "../path-guard";

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

const KEYS_DIR_NAME = "keys";
const PRIVATE_KEY_MODE = 0o600;

export function getRepoId(remoteUrl: string): string {
  return createHash("sha256").update(remoteUrl).digest("hex").slice(0, 16);
}

export function privateKeyDir(): string {
  const home = process.env.HOME;
  if (!home) throw new Error("HOME environment variable is not set");
  return join(home, ".test-verifier", KEYS_DIR_NAME);
}

export function publicKeyDir(repoRoot: string): string {
  return join(repoRoot, ".test-verifier", KEYS_DIR_NAME);
}

export function privateKeyPath(repoId: string): string {
  assertSafeFilename(repoId);
  return join(privateKeyDir(), `${repoId}.key`);
}

export function publicKeyPath(repoRoot: string, email: string): string {
  assertSafeFilename(email);
  return join(publicKeyDir(repoRoot), `${email}.pub`);
}

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

export async function storePrivateKey(repoId: string, privateKeyPem: string): Promise<string> {
  const dir = privateKeyDir();
  await mkdir(dir, { recursive: true });
  const path = privateKeyPath(repoId);
  await writeFile(path, privateKeyPem, { mode: PRIVATE_KEY_MODE });
  return path;
}

export async function storePublicKey(
  repoRoot: string,
  email: string,
  publicKeyPem: string,
): Promise<string> {
  const dir = publicKeyDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const path = publicKeyPath(repoRoot, email);
  await writeFile(path, publicKeyPem);
  return path;
}

export async function loadPrivateKey(repoId: string): Promise<string | null> {
  try {
    return await readFile(privateKeyPath(repoId), "utf-8");
  } catch {
    return null;
  }
}

export async function loadPublicKey(repoRoot: string, email: string): Promise<string | null> {
  try {
    return await readFile(publicKeyPath(repoRoot, email), "utf-8");
  } catch {
    return null;
  }
}

export async function privateKeyFileMode(repoId: string): Promise<number | null> {
  try {
    const s = await stat(privateKeyPath(repoId));
    return s.mode & 0o777;
  } catch {
    return null;
  }
}

export async function getOriginUrl(repoRoot: string): Promise<string> {
  const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error("No git remote 'origin' found");
  }
  return text.trim();
}

export async function initKeys(
  repoRoot: string,
  email: string,
): Promise<{ repoId: string; created: boolean }> {
  const originUrl = await getOriginUrl(repoRoot);
  const repoId = getRepoId(originUrl);

  const existing = await loadPrivateKey(repoId);
  if (existing) {
    return { repoId, created: false };
  }

  const kp = generateKeyPair();
  await storePrivateKey(repoId, kp.privateKey);
  await storePublicKey(repoRoot, email, kp.publicKey);
  return { repoId, created: true };
}
