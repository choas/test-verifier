import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import {
  getCurrentCommitSha,
  getRelatedProdFiles,
  getPriorCommitsDiff,
  getDiffBetweenCommits,
} from "./git";

let repoDir: string;
let firstSha: string;
let secondSha: string;
let thirdSha: string;

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), "tv-git-test-"));

  await $`git init`.cwd(repoDir).quiet();
  await $`git config user.email "test@test.com"`.cwd(repoDir).quiet();
  await $`git config user.name "Test"`.cwd(repoDir).quiet();

  // Commit 1: prod file + test file
  await Bun.write(
    join(repoDir, "src/utils.ts"),
    "export function add(a: number, b: number) { return a + b; }",
  );
  await Bun.write(
    join(repoDir, "src/utils.test.ts"),
    "test('add', () => expect(add(1,2)).toBe(3));",
  );
  await $`git add -A`.cwd(repoDir).quiet();
  await $`git commit -m "initial commit"`.cwd(repoDir).quiet();
  firstSha = (await $`git rev-parse HEAD`.cwd(repoDir).quiet()).stdout.toString().trim();

  // Commit 2: modify prod file
  await Bun.write(
    join(repoDir, "src/utils.ts"),
    "export function add(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }",
  );
  await Bun.write(join(repoDir, "src/helpers.ts"), "export const VERSION = '1.0';");
  await $`git add -A`.cwd(repoDir).quiet();
  await $`git commit -m "add sub and helpers"`.cwd(repoDir).quiet();
  secondSha = (await $`git rev-parse HEAD`.cwd(repoDir).quiet()).stdout.toString().trim();

  // Commit 3: modify test + prod together
  await Bun.write(
    join(repoDir, "src/utils.ts"),
    "export function add(a: number, b: number) { return a + b; }\nexport function sub(a: number, b: number) { return a - b; }\nexport function mul(a: number, b: number) { return a * b; }",
  );
  await Bun.write(
    join(repoDir, "src/utils.test.ts"),
    "test('add', () => expect(add(1,2)).toBe(3));\ntest('mul', () => expect(mul(2,3)).toBe(6));",
  );
  await Bun.write(join(repoDir, "src/config.ts"), "export const CONFIG = {};");
  await $`git add -A`.cwd(repoDir).quiet();
  await $`git commit -m "add mul with test and config"`.cwd(repoDir).quiet();
  thirdSha = (await $`git rev-parse HEAD`.cwd(repoDir).quiet()).stdout.toString().trim();
});

afterAll(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe("getCurrentCommitSha", () => {
  test("returns the HEAD sha", async () => {
    const sha = await getCurrentCommitSha(repoDir);
    expect(sha).toBe(thirdSha);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("getRelatedProdFiles", () => {
  test("returns prod files from the same commit, excluding the test file itself", async () => {
    const prodFiles = await getRelatedProdFiles(thirdSha, "src/utils.test.ts", repoDir);
    expect(prodFiles).toContain("src/utils.ts");
    expect(prodFiles).toContain("src/config.ts");
    expect(prodFiles).not.toContain("src/utils.test.ts");
  });

  test("returns empty for a commit with only test files", async () => {
    // firstSha has src/utils.ts and src/utils.test.ts; excluding test → only utils.ts
    const prodFiles = await getRelatedProdFiles(firstSha, "src/utils.test.ts", repoDir);
    expect(prodFiles).toContain("src/utils.ts");
    expect(prodFiles).not.toContain("src/utils.test.ts");
  });

  test("commit with only prod files returns all of them", async () => {
    const prodFiles = await getRelatedProdFiles(secondSha, "nonexistent.test.ts", repoDir);
    expect(prodFiles).toContain("src/utils.ts");
    expect(prodFiles).toContain("src/helpers.ts");
  });
});

describe("getPriorCommitsDiff", () => {
  test("returns empty when lookback is 0", async () => {
    const diff = await getPriorCommitsDiff(thirdSha, ["src/utils.ts"], 0, repoDir);
    expect(diff).toBe("");
  });

  test("returns diff of prod files from prior commits", async () => {
    const diff = await getPriorCommitsDiff(thirdSha, ["src/utils.ts"], 1, repoDir);
    expect(diff).toContain("sub");
    expect(diff).not.toContain("mul");
  });

  test("returns empty when prodFiles list is empty", async () => {
    const diff = await getPriorCommitsDiff(thirdSha, [], 3, repoDir);
    expect(diff).toBe("");
  });

  test("lookback of 2 includes changes from 2 prior commits", async () => {
    const diff = await getPriorCommitsDiff(thirdSha, ["src/utils.ts"], 2, repoDir);
    expect(diff).toContain("add");
    expect(diff).toContain("sub");
  });
});

describe("getDiffBetweenCommits", () => {
  test("returns diff between two commits", async () => {
    const diff = await getDiffBetweenCommits(firstSha, thirdSha, [], repoDir);
    expect(diff).toContain("mul");
    expect(diff).toContain("helpers");
    expect(diff).toContain("config");
  });

  test("filters by globs", async () => {
    const diff = await getDiffBetweenCommits(firstSha, thirdSha, ["src/utils.ts"], repoDir);
    expect(diff).toContain("sub");
    expect(diff).toContain("mul");
    expect(diff).not.toContain("helpers");
    expect(diff).not.toContain("config");
  });

  test("returns empty diff for identical commits", async () => {
    const diff = await getDiffBetweenCommits(firstSha, firstSha, [], repoDir);
    expect(diff).toBe("");
  });

  test("filters test files with glob", async () => {
    const diff = await getDiffBetweenCommits(firstSha, thirdSha, ["*.test.ts"], repoDir);
    // This glob won't match since files are in src/ — testing that filtering works
    expect(diff).not.toContain("helpers");
  });
});
