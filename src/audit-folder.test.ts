import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureAuditDir,
  readHead,
  writeHead,
  listByStatus,
  moveToApproved,
  moveToRejected,
  auditDir,
  statusDir,
} from "./audit-folder";

let tmpRepo: string;

beforeEach(async () => {
  tmpRepo = await mkdtemp(join(tmpdir(), "tv-audit-"));
});

afterEach(async () => {
  await rm(tmpRepo, { recursive: true, force: true });
});

describe("ensureAuditDir", () => {
  test("creates all expected subdirectories", async () => {
    await ensureAuditDir(tmpRepo);
    const entries = await readdir(auditDir(tmpRepo));
    expect(entries).toContain("pending");
    expect(entries).toContain("approved");
    expect(entries).toContain("rejected");
    expect(entries).toContain("archive");
    expect(entries).toContain("keys");
  });

  test("is idempotent", async () => {
    await ensureAuditDir(tmpRepo);
    await ensureAuditDir(tmpRepo);
    const entries = await readdir(auditDir(tmpRepo));
    expect(entries.length).toBe(7);
  });

  test("directories are actual directories", async () => {
    await ensureAuditDir(tmpRepo);
    for (const dir of ["pending", "approved", "rejected", "archive", "keys"]) {
      const s = await stat(join(auditDir(tmpRepo), dir));
      expect(s.isDirectory()).toBe(true);
    }
  });
});

describe("readHead / writeHead", () => {
  test("returns null when HEAD does not exist", async () => {
    const sha = await readHead(tmpRepo);
    expect(sha).toBeNull();
  });

  test("writes and reads back a SHA", async () => {
    const sha = "abc1234567890abcdef1234567890abcdef123456";
    await writeHead(tmpRepo, sha);
    const read = await readHead(tmpRepo);
    expect(read).toBe(sha);
  });

  test("overwrites previous SHA", async () => {
    await writeHead(tmpRepo, "aaaa");
    await writeHead(tmpRepo, "bbbb");
    expect(await readHead(tmpRepo)).toBe("bbbb");
  });

  test("returns null for empty HEAD file", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(auditDir(tmpRepo), "HEAD"), "");
    expect(await readHead(tmpRepo)).toBeNull();
  });

  test("trims whitespace from HEAD file", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(auditDir(tmpRepo), "HEAD"), "  abc123  \n");
    expect(await readHead(tmpRepo)).toBe("abc123");
  });
});

describe("listByStatus", () => {
  test("returns empty array when directory does not exist", async () => {
    const files = await listByStatus(tmpRepo, "pending");
    expect(files).toEqual([]);
  });

  test("returns empty array when directory is empty", async () => {
    await ensureAuditDir(tmpRepo);
    const files = await listByStatus(tmpRepo, "pending");
    expect(files).toEqual([]);
  });

  test("lists files in pending", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(statusDir(tmpRepo, "pending"), "stub-a.md"), "a");
    await Bun.write(join(statusDir(tmpRepo, "pending"), "stub-b.md"), "b");
    const files = await listByStatus(tmpRepo, "pending");
    expect(files).toEqual(["stub-a.md", "stub-b.md"]);
  });

  test("returns sorted results", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(statusDir(tmpRepo, "approved"), "z.md"), "z");
    await Bun.write(join(statusDir(tmpRepo, "approved"), "a.md"), "a");
    await Bun.write(join(statusDir(tmpRepo, "approved"), "m.md"), "m");
    const files = await listByStatus(tmpRepo, "approved");
    expect(files).toEqual(["a.md", "m.md", "z.md"]);
  });

  test("excludes dotfiles", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(statusDir(tmpRepo, "pending"), ".gitkeep"), "");
    await Bun.write(join(statusDir(tmpRepo, "pending"), "real.md"), "x");
    const files = await listByStatus(tmpRepo, "pending");
    expect(files).toEqual(["real.md"]);
  });
});

describe("moveToApproved", () => {
  test("moves file from pending to approved", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(statusDir(tmpRepo, "pending"), "stub.md"), "content");

    const dest = await moveToApproved(tmpRepo, "stub.md");
    expect(dest).toBe(join(statusDir(tmpRepo, "approved"), "stub.md"));

    const content = await readFile(dest, "utf-8");
    expect(content).toBe("content");

    const pending = await listByStatus(tmpRepo, "pending");
    expect(pending).not.toContain("stub.md");
  });

  test("throws when source file does not exist", async () => {
    await ensureAuditDir(tmpRepo);
    expect(moveToApproved(tmpRepo, "nonexistent.md")).rejects.toThrow();
  });
});

describe("moveToRejected", () => {
  test("moves file from pending to rejected", async () => {
    await ensureAuditDir(tmpRepo);
    await Bun.write(join(statusDir(tmpRepo, "pending"), "stub.md"), "content");

    const dest = await moveToRejected(tmpRepo, "stub.md");
    expect(dest).toBe(join(statusDir(tmpRepo, "rejected"), "stub.md"));

    const content = await readFile(dest, "utf-8");
    expect(content).toBe("content");

    const pending = await listByStatus(tmpRepo, "pending");
    expect(pending).not.toContain("stub.md");
  });

  test("throws when source file does not exist", async () => {
    await ensureAuditDir(tmpRepo);
    expect(moveToRejected(tmpRepo, "nonexistent.md")).rejects.toThrow();
  });
});

describe("path helpers", () => {
  test("auditDir returns .test-verifier path", () => {
    expect(auditDir("/repo")).toBe(join("/repo", ".test-verifier"));
  });

  test("statusDir returns correct subdirectory", () => {
    expect(statusDir("/repo", "pending")).toBe(join("/repo", ".test-verifier", "pending"));
    expect(statusDir("/repo", "approved")).toBe(join("/repo", ".test-verifier", "approved"));
    expect(statusDir("/repo", "rejected")).toBe(join("/repo", ".test-verifier", "rejected"));
  });
});
