import { describe, test, expect } from "bun:test";
import {
  assertSafeRelativePath,
  resolveWithinBase,
  assertSafeFilename,
  assertValidSha,
} from "./path-guard";

describe("assertSafeRelativePath", () => {
  test("accepts simple relative paths", () => {
    expect(() => assertSafeRelativePath("src/index.ts")).not.toThrow();
    expect(() => assertSafeRelativePath("file.txt")).not.toThrow();
    expect(() => assertSafeRelativePath("a/b/c/d.ts")).not.toThrow();
  });

  test("rejects null bytes", () => {
    expect(() => assertSafeRelativePath("file\0.txt")).toThrow("null byte");
  });

  test("rejects path traversal with ..", () => {
    expect(() => assertSafeRelativePath("../etc/passwd")).toThrow("Path traversal");
    expect(() => assertSafeRelativePath("src/../../secret")).toThrow("Path traversal");
    expect(() => assertSafeRelativePath("a/b/../../../c")).toThrow("Path traversal");
  });

  test("rejects absolute paths", () => {
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow("Absolute path");
    expect(() => assertSafeRelativePath("\\Windows\\System32")).toThrow();
  });

  test("accepts paths with dots in filenames", () => {
    expect(() => assertSafeRelativePath("src/.gitignore")).not.toThrow();
    expect(() => assertSafeRelativePath("file.test.ts")).not.toThrow();
    expect(() => assertSafeRelativePath(".hidden/file")).not.toThrow();
  });
});

describe("resolveWithinBase", () => {
  test("resolves valid relative path within base", () => {
    const result = resolveWithinBase("/home/user/project", "src/index.ts");
    expect(result).toBe("/home/user/project/src/index.ts");
  });

  test("rejects paths that escape base directory", () => {
    expect(() => resolveWithinBase("/home/user/project", "../../../etc/passwd")).toThrow();
  });

  test("rejects absolute relative paths", () => {
    expect(() => resolveWithinBase("/home/user/project", "/etc/passwd")).toThrow();
  });

  test("resolves nested paths correctly", () => {
    const result = resolveWithinBase("/base", "a/b/c.ts");
    expect(result).toBe("/base/a/b/c.ts");
  });
});

describe("assertSafeFilename", () => {
  test("accepts valid filenames", () => {
    expect(() => assertSafeFilename("file.txt")).not.toThrow();
    expect(() => assertSafeFilename("test-123.ts")).not.toThrow();
    expect(() => assertSafeFilename("my_file.spec.ts")).not.toThrow();
  });

  test("rejects null bytes", () => {
    expect(() => assertSafeFilename("file\0.txt")).toThrow("null byte");
  });

  test("rejects path separators", () => {
    expect(() => assertSafeFilename("path/file.txt")).toThrow("path separator");
    expect(() => assertSafeFilename("path\\file.txt")).toThrow("path separator");
  });

  test("rejects dot-dot", () => {
    expect(() => assertSafeFilename("..")).toThrow("Invalid filename");
  });

  test("rejects single dot", () => {
    expect(() => assertSafeFilename(".")).toThrow("Invalid filename");
  });

  test("accepts dotfiles", () => {
    expect(() => assertSafeFilename(".gitignore")).not.toThrow();
    expect(() => assertSafeFilename(".env")).not.toThrow();
  });
});

describe("assertValidSha", () => {
  test("accepts valid hex SHAs", () => {
    expect(() => assertValidSha("abc1234")).not.toThrow();
    expect(() => assertValidSha("abc1234567890abcdef1234567890abcdef1234")).not.toThrow();
    expect(() => assertValidSha("0000")).not.toThrow();
  });

  test("rejects non-hex strings", () => {
    expect(() => assertValidSha("xyz123")).toThrow("Invalid commit SHA");
    expect(() => assertValidSha("ABCDEF")).toThrow("Invalid commit SHA");
    expect(() => assertValidSha("abc-123")).toThrow("Invalid commit SHA");
  });

  test("rejects too-short strings", () => {
    expect(() => assertValidSha("abc")).toThrow("Invalid commit SHA");
    expect(() => assertValidSha("")).toThrow("Invalid commit SHA");
  });

  test("rejects too-long strings", () => {
    expect(() => assertValidSha("a".repeat(41))).toThrow("Invalid commit SHA");
  });

  test("rejects strings with spaces", () => {
    expect(() => assertValidSha("abc 1234")).toThrow("Invalid commit SHA");
  });
});
