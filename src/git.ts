import { $ } from "bun";
import { assertSafeRelativePath } from "./path-guard";

export async function getCurrentCommitSha(cwd?: string): Promise<string> {
  const result = await $`git rev-parse HEAD`.cwd(cwd ?? ".").quiet();
  if (result.exitCode !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

export async function getRelatedProdFiles(
  commitSha: string,
  testFile: string,
  cwd?: string,
): Promise<string[]> {
  const dir = cwd ?? ".";
  const result = await $`git diff-tree --no-commit-id --root --name-only -r ${commitSha}`
    .cwd(dir)
    .quiet();
  if (result.exitCode !== 0) {
    throw new Error(`git diff-tree failed: ${result.stderr.toString()}`);
  }
  const files = result.stdout
    .toString()
    .trim()
    .split("\n")
    .filter((f) => f.length > 0);

  const normalized = testFile.replace(/\\/g, "/");
  return files.filter((f) => {
    const fn = f.replace(/\\/g, "/");
    return fn !== normalized && !isTestFile(fn);
  });
}

export async function getPriorCommitsDiff(
  commitSha: string,
  prodFiles: string[],
  lookback: number,
  cwd?: string,
): Promise<string> {
  if (lookback <= 0 || prodFiles.length === 0) return "";
  const dir = cwd ?? ".";

  const startRef = `${commitSha}~1`;
  const result =
    await $`git log -n ${lookback} -p --format= ${startRef} -- ${prodFiles}`
      .cwd(dir)
      .quiet()
      .nothrow();
  if (result.exitCode !== 0) return "";

  return result.stdout.toString().trim();
}

export async function getDiffBetweenCommits(
  fromSha: string,
  toSha: string,
  globs: string[],
  cwd?: string,
): Promise<string> {
  const dir = cwd ?? ".";
  const args = globs.length > 0 ? ["--", ...globs] : [];
  const result = await $`git diff ${fromSha}..${toSha} ${args}`.cwd(dir).quiet();
  if (result.exitCode !== 0) {
    throw new Error(`git diff failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

export async function getStagedDiff(
  globs: string[],
  cwd?: string,
): Promise<string> {
  const dir = cwd ?? ".";
  const args = globs.length > 0 ? ["--", ...globs] : [];
  const result = await $`git diff --cached HEAD ${args}`.cwd(dir).quiet().nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString().trim();
}

export async function getUncommittedDiff(
  globs: string[],
  cwd?: string,
): Promise<string> {
  const dir = cwd ?? ".";
  const args = globs.length > 0 ? ["--", ...globs] : [];
  const result = await $`git diff HEAD ${args}`.cwd(dir).quiet().nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString().trim();
}

export async function getFileFromIndex(
  filePath: string,
  cwd?: string,
): Promise<string> {
  assertSafeRelativePath(filePath);
  const dir = cwd ?? ".";
  const result = await $`git show :${filePath}`.cwd(dir).quiet().nothrow();
  if (result.exitCode !== 0) return "";
  return result.stdout.toString();
}

function isTestFile(filePath: string): boolean {
  const p = filePath.replace(/\\/g, "/");
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mts|mjs|svelte\.ts)$/.test(p)) return true;
  if (/\/__tests__\//.test(p)) return true;
  if (/\/tests?\//.test(p) && /\.[tj]sx?$/.test(p)) return true;
  return false;
}
