import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  getRepoId,
  generateKeyPair,
  storePrivateKey,
  storePublicKey,
  loadPrivateKey,
  loadPublicKey,
  privateKeyDir,
  privateKeyPath,
  publicKeyPath,
  privateKeyFileMode,
} from "./keys";

let tmpHome: string;
let tmpRepo: string;
const originalHome = process.env.HOME;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), "tv-keys-home-"));
  tmpRepo = await mkdtemp(join(tmpdir(), "tv-keys-repo-"));
  process.env.HOME = tmpHome;
});

afterEach(async () => {
  process.env.HOME = originalHome;
  await rm(tmpHome, { recursive: true, force: true });
  await rm(tmpRepo, { recursive: true, force: true });
});

describe("getRepoId", () => {
  test("returns a deterministic 16-char hex string", () => {
    const id = getRepoId("git@github.com:user/repo.git");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).toBe(getRepoId("git@github.com:user/repo.git"));
  });

  test("different URLs produce different ids", () => {
    const a = getRepoId("git@github.com:user/repo-a.git");
    const b = getRepoId("git@github.com:user/repo-b.git");
    expect(a).not.toBe(b);
  });
});

describe("generateKeyPair", () => {
  test("produces valid Ed25519 PEM keys", () => {
    const kp = generateKeyPair();
    expect(kp.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(kp.privateKey).toContain("BEGIN PRIVATE KEY");

    const privObj = createPrivateKey(kp.privateKey);
    expect(privObj.asymmetricKeyType).toBe("ed25519");

    const pubObj = createPublicKey(kp.publicKey);
    expect(pubObj.asymmetricKeyType).toBe("ed25519");
  });
});

describe("store and load private key", () => {
  const repoId = "abc123def456abcd";
  const fakePem = "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n";

  test("stores and loads private key", async () => {
    await storePrivateKey(repoId, fakePem);
    const loaded = await loadPrivateKey(repoId);
    expect(loaded).toBe(fakePem);
  });

  test("private key file has mode 0600", async () => {
    await storePrivateKey(repoId, fakePem);
    const mode = await privateKeyFileMode(repoId);
    expect(mode).toBe(0o600);
  });

  test("loadPrivateKey returns null when missing", async () => {
    const loaded = await loadPrivateKey("nonexistent0000a");
    expect(loaded).toBeNull();
  });
});

describe("store and load public key", () => {
  const email = "dev@example.com";
  const fakePem = "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n";

  test("stores and loads public key", async () => {
    await storePublicKey(tmpRepo, email, fakePem);
    const loaded = await loadPublicKey(tmpRepo, email);
    expect(loaded).toBe(fakePem);
  });

  test("public key is written into repo .test-verifier/keys/", async () => {
    await storePublicKey(tmpRepo, email, fakePem);
    const expected = join(tmpRepo, ".test-verifier", "keys", `${email}.pub`);
    const content = await readFile(expected, "utf-8");
    expect(content).toBe(fakePem);
  });

  test("loadPublicKey returns null when missing", async () => {
    const loaded = await loadPublicKey(tmpRepo, "nobody@example.com");
    expect(loaded).toBeNull();
  });
});

describe("path helpers", () => {
  test("privateKeyPath uses HOME", () => {
    const p = privateKeyPath("abc123def456abcd");
    expect(p).toBe(join(tmpHome, ".test-verifier", "keys", "abc123def456abcd.key"));
  });

  test("publicKeyPath uses repo root", () => {
    const p = publicKeyPath(tmpRepo, "dev@example.com");
    expect(p).toBe(join(tmpRepo, ".test-verifier", "keys", "dev@example.com.pub"));
  });
});
