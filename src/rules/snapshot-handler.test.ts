import { describe, test, expect } from "bun:test";
import { parseDiff } from "../diff-parser";
import { Severity } from "../types";
import {
  detectSnapshotChanges,
  isSnapFile,
  isTestFile,
  findPairedTestFile,
  truncateDiff,
  truncateHeadTail,
  truncateSample,
  truncateSummary,
} from "./snapshot-handler";

describe("isSnapFile", () => {
  test("matches .snap files", () => {
    expect(isSnapFile("foo.test.ts.snap")).toBe(true);
    expect(isSnapFile("__snapshots__/bar.snap")).toBe(true);
    expect(isSnapFile("deep/path/__snapshots__/x.test.tsx.snap")).toBe(true);
  });

  test("rejects non-snap files", () => {
    expect(isSnapFile("foo.test.ts")).toBe(false);
    expect(isSnapFile("snapshot.ts")).toBe(false);
    expect(isSnapFile("file.snapper")).toBe(false);
  });
});

describe("isTestFile", () => {
  test("matches test files", () => {
    expect(isTestFile("foo.test.ts")).toBe(true);
    expect(isTestFile("foo.spec.ts")).toBe(true);
    expect(isTestFile("foo.test.tsx")).toBe(true);
    expect(isTestFile("foo.test.js")).toBe(true);
    expect(isTestFile("foo.spec.jsx")).toBe(true);
    expect(isTestFile("foo.test.mts")).toBe(true);
    expect(isTestFile("foo.test.mjs")).toBe(true);
    expect(isTestFile("foo.test.svelte.ts")).toBe(true);
  });

  test("matches __tests__ directory files", () => {
    expect(isTestFile("src/__tests__/foo.ts")).toBe(true);
    expect(isTestFile("lib/__tests__/utils.js")).toBe(true);
  });

  test("rejects non-test files", () => {
    expect(isTestFile("foo.ts")).toBe(false);
    expect(isTestFile("test.ts")).toBe(false);
    expect(isTestFile("utils.js")).toBe(false);
  });
});

describe("findPairedTestFile", () => {
  test("pairs __snapshots__/foo.test.ts.snap with foo.test.ts", () => {
    const paths = new Set(["src/foo.test.ts"]);
    expect(
      findPairedTestFile("src/__snapshots__/foo.test.ts.snap", paths),
    ).toBe("src/foo.test.ts");
  });

  test("pairs root-level __snapshots__ path", () => {
    const paths = new Set(["foo.test.ts"]);
    expect(findPairedTestFile("__snapshots__/foo.test.ts.snap", paths)).toBe(
      "foo.test.ts",
    );
  });

  test("returns null when no paired test found", () => {
    const paths = new Set(["src/bar.test.ts"]);
    expect(
      findPairedTestFile("src/__snapshots__/foo.test.ts.snap", paths),
    ).toBeNull();
  });

  test("matches by basename fallback", () => {
    const paths = new Set(["other/dir/foo.test.ts"]);
    expect(
      findPairedTestFile("src/__snapshots__/foo.test.ts.snap", paths),
    ).toBe("other/dir/foo.test.ts");
  });

  test("returns null for empty set", () => {
    expect(
      findPairedTestFile("src/__snapshots__/foo.test.ts.snap", new Set()),
    ).toBeNull();
  });
});

describe("detectSnapshotChanges", () => {
  test("detects inline snapshot change (SUSPICIOUS)", () => {
    const diff = [
      "diff --git a/src/foo.test.ts b/src/foo.test.ts",
      "--- a/src/foo.test.ts",
      "+++ b/src/foo.test.ts",
      "@@ -1,5 +1,5 @@",
      ' test("renders", () => {',
      "-  expect(render()).toMatchInlineSnapshot(`old content`);",
      "+  expect(render()).toMatchInlineSnapshot(`new content`);",
      " });",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("snapshot/inline-change");
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
    expect(findings[0].before).toContain("old content");
    expect(findings[0].after).toContain("new content");
  });

  test("detects inline snapshot change with content on separate lines", () => {
    const diff = [
      "diff --git a/src/foo.test.ts b/src/foo.test.ts",
      "--- a/src/foo.test.ts",
      "+++ b/src/foo.test.ts",
      "@@ -1,7 +1,7 @@",
      ' test("renders", () => {',
      "   expect(render()).toMatchInlineSnapshot(`",
      "-    <div>old</div>",
      "+    <div>new</div>",
      "   `);",
      " });",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("snapshot/inline-change");
    expect(findings[0].before).toContain("<div>old</div>");
    expect(findings[0].after).toContain("<div>new</div>");
  });

  test("detects toThrowErrorMatchingInlineSnapshot change", () => {
    const diff = [
      "diff --git a/src/err.test.ts b/src/err.test.ts",
      "--- a/src/err.test.ts",
      "+++ b/src/err.test.ts",
      "@@ -1,3 +1,3 @@",
      ' test("throws", () => {',
      '-  expect(() => boom()).toThrowErrorMatchingInlineSnapshot(`old error`);',
      '+  expect(() => boom()).toThrowErrorMatchingInlineSnapshot(`new error`);',
      " });",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("snapshot/inline-change");
  });

  test("does not flag new inline snapshot addition", () => {
    const diff = [
      "diff --git a/src/foo.test.ts b/src/foo.test.ts",
      "--- a/src/foo.test.ts",
      "+++ b/src/foo.test.ts",
      "@@ -1,2 +1,5 @@",
      ' test("existing", () => {',
      " });",
      '+test("new", () => {',
      "+  expect(render()).toMatchInlineSnapshot(`content`);",
      "+});",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toEqual([]);
  });

  test("detects .snap change paired with test code change (SUSPICIOUS)", () => {
    const diff = [
      "diff --git a/src/__snapshots__/foo.test.ts.snap b/src/__snapshots__/foo.test.ts.snap",
      "--- a/src/__snapshots__/foo.test.ts.snap",
      "+++ b/src/__snapshots__/foo.test.ts.snap",
      "@@ -1,3 +1,3 @@",
      ' exports[`renders 1`] = `',
      "-<div>old</div>",
      "+<div>new</div>",
      " `;",
      "diff --git a/src/foo.test.ts b/src/foo.test.ts",
      "--- a/src/foo.test.ts",
      "+++ b/src/foo.test.ts",
      "@@ -1,3 +1,3 @@",
      ' test("renders", () => {',
      "-  expect(render()).toMatchSnapshot();",
      '+  expect(render("arg")).toMatchSnapshot();',
      " });",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    const snapFindings = findings.filter(
      (f) => f.rule === "snapshot/paired-update",
    );
    expect(snapFindings).toHaveLength(1);
    expect(snapFindings[0].severity).toBe(Severity.SUSPICIOUS);
    expect(snapFindings[0].message).toContain("foo.test.ts.snap");
    expect(snapFindings[0].message).toContain("foo.test.ts");
  });

  test("detects .snap change without test code change (CRITICAL)", () => {
    const diff = [
      "diff --git a/src/__snapshots__/foo.test.ts.snap b/src/__snapshots__/foo.test.ts.snap",
      "--- a/src/__snapshots__/foo.test.ts.snap",
      "+++ b/src/__snapshots__/foo.test.ts.snap",
      "@@ -1,3 +1,3 @@",
      ' exports[`renders 1`] = `',
      "-<div>old</div>",
      "+<div>new</div>",
      " `;",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("snapshot/unpaired-update");
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("no corresponding test code change");
  });

  test("detects .snap file deletion (CRITICAL)", () => {
    const diff = [
      "diff --git a/src/__snapshots__/foo.test.ts.snap b/src/__snapshots__/foo.test.ts.snap",
      "deleted file mode 100644",
      "--- a/src/__snapshots__/foo.test.ts.snap",
      "+++ /dev/null",
      "@@ -1,3 +0,0 @@",
      '-exports[`renders 1`] = `',
      "-<div>content</div>",
      "-`;",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("snapshot/deletion");
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("deleted entirely");
    expect(findings[0].before).toContain("<div>content</div>");
    expect(findings[0].after).toBe("");
  });

  test("no findings for unrelated file changes", () => {
    const diff = [
      "diff --git a/src/utils.ts b/src/utils.ts",
      "--- a/src/utils.ts",
      "+++ b/src/utils.ts",
      "@@ -1,1 +1,1 @@",
      "-export function add(a, b) { return a + b; }",
      "+export function add(a: number, b: number) { return a + b; }",
    ].join("\n");

    expect(detectSnapshotChanges(parseDiff(diff))).toEqual([]);
  });

  test("empty diff produces no findings", () => {
    expect(detectSnapshotChanges([])).toEqual([]);
  });

  test("custom severity config overrides defaults", () => {
    const diff = [
      "diff --git a/__snapshots__/x.test.ts.snap b/__snapshots__/x.test.ts.snap",
      "--- a/__snapshots__/x.test.ts.snap",
      "+++ b/__snapshots__/x.test.ts.snap",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff), {
      unpairedUpdate: Severity.LOW,
    });
    expect(findings[0].severity).toBe(Severity.LOW);
  });

  test("snap deletion preserves removed content in before field", () => {
    const diff = [
      "diff --git a/snaps/a.test.ts.snap b/snaps/a.test.ts.snap",
      "deleted file mode 100644",
      "--- a/snaps/a.test.ts.snap",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-snapshot line one",
      "-snapshot line two",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings[0].before).toContain("snapshot line one");
    expect(findings[0].before).toContain("snapshot line two");
  });

  test("multiple snap files in same diff", () => {
    const diff = [
      "diff --git a/__snapshots__/a.test.ts.snap b/__snapshots__/a.test.ts.snap",
      "--- a/__snapshots__/a.test.ts.snap",
      "+++ b/__snapshots__/a.test.ts.snap",
      "@@ -1,1 +1,1 @@",
      "-old-a",
      "+new-a",
      "diff --git a/__snapshots__/b.test.ts.snap b/__snapshots__/b.test.ts.snap",
      "--- a/__snapshots__/b.test.ts.snap",
      "+++ b/__snapshots__/b.test.ts.snap",
      "@@ -1,1 +1,1 @@",
      "-old-b",
      "+new-b",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings).toHaveLength(2);
    expect(findings[0].rule).toBe("snapshot/unpaired-update");
    expect(findings[1].rule).toBe("snapshot/unpaired-update");
  });

  test("inline snapshot + snap file change in same commit", () => {
    const diff = [
      "diff --git a/src/foo.test.ts b/src/foo.test.ts",
      "--- a/src/foo.test.ts",
      "+++ b/src/foo.test.ts",
      "@@ -1,3 +1,3 @@",
      ' test("inline", () => {',
      "-  expect(x).toMatchInlineSnapshot(`old`);",
      "+  expect(x).toMatchInlineSnapshot(`new`);",
      " });",
      "diff --git a/src/__snapshots__/foo.test.ts.snap b/src/__snapshots__/foo.test.ts.snap",
      "--- a/src/__snapshots__/foo.test.ts.snap",
      "+++ b/src/__snapshots__/foo.test.ts.snap",
      "@@ -1,1 +1,1 @@",
      "-snap-old",
      "+snap-new",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    const inlineFindings = findings.filter(
      (f) => f.rule === "snapshot/inline-change",
    );
    const pairedFindings = findings.filter(
      (f) => f.rule === "snapshot/paired-update",
    );
    expect(inlineFindings).toHaveLength(1);
    expect(pairedFindings).toHaveLength(1);
  });

  test("reports correct line numbers", () => {
    const diff = [
      "diff --git a/__snapshots__/x.test.ts.snap b/__snapshots__/x.test.ts.snap",
      "--- a/__snapshots__/x.test.ts.snap",
      "+++ b/__snapshots__/x.test.ts.snap",
      "@@ -5,3 +5,3 @@",
      " context",
      "-old value",
      "+new value",
      " context",
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff));
    expect(findings[0].line).toBe(6);
  });
});

describe("truncation", () => {
  describe("truncateHeadTail", () => {
    test("returns text unchanged when under limit", () => {
      expect(truncateHeadTail("short", 100)).toBe("short");
    });

    test("truncates with marker", () => {
      const text = "a".repeat(200);
      const result = truncateHeadTail(text, 80);
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result).toContain("[... truncated ...]");
      expect(result).toMatch(/^a+/);
      expect(result).toMatch(/a+$/);
    });

    test("handles very small max size", () => {
      const text = "a".repeat(100);
      const result = truncateHeadTail(text, 5);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe("truncateSample", () => {
    test("returns all lines when under limit", () => {
      const lines = ["line1", "line2", "line3"];
      expect(truncateSample(lines, 1000)).toBe("line1\nline2\nline3");
    });

    test("samples evenly spaced lines", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line-${i}`);
      const result = truncateSample(lines, 100);
      expect(result.length).toBeLessThanOrEqual(150);
      expect(result).toContain("sampled out");
    });

    test("returns empty for empty input", () => {
      expect(truncateSample([], 100)).toBe("");
    });
  });

  describe("truncateSummary", () => {
    test("produces line and byte count", () => {
      const result = truncateSummary(["a", "bb", "ccc"], 8);
      expect(result).toBe("[3 lines, 8 bytes]");
    });
  });

  describe("truncateDiff", () => {
    test("no truncation when under limit", () => {
      const result = truncateDiff("small", "content", 1000, "head-tail");
      expect(result.truncated).toBe(false);
      expect(result.before).toBe("small");
      expect(result.after).toBe("content");
    });

    test("head-tail splits budget proportionally", () => {
      const before = "x".repeat(8000);
      const after = "y".repeat(2000);
      const result = truncateDiff(before, after, 5000, "head-tail");
      expect(result.truncated).toBe(true);
      expect(result.before.length).toBeGreaterThan(result.after.length);
      expect(result.before.length + result.after.length).toBeLessThanOrEqual(
        5100,
      );
    });

    test("sample strategy", () => {
      const before = Array.from({ length: 50 }, (_, i) => `old-${i}`).join(
        "\n",
      );
      const after = Array.from({ length: 50 }, (_, i) => `new-${i}`).join(
        "\n",
      );
      const result = truncateDiff(before, after, 200, "sample");
      expect(result.truncated).toBe(true);
      expect(result.before.length + result.after.length).toBeLessThanOrEqual(
        300,
      );
    });

    test("summary strategy", () => {
      const before = "x".repeat(5000);
      const after = "y".repeat(5000);
      const result = truncateDiff(before, after, 100, "summary");
      expect(result.truncated).toBe(true);
      expect(result.before).toMatch(/\[\d+ lines?, \d+ bytes\]/);
      expect(result.after).toMatch(/\[\d+ lines?, \d+ bytes\]/);
    });

    test("handles empty before (new file)", () => {
      const result = truncateDiff("", "y".repeat(200), 50, "head-tail");
      expect(result.truncated).toBe(true);
      expect(result.before).toBe("");
      expect(result.after.length).toBeLessThanOrEqual(50);
    });

    test("handles empty after (deleted file)", () => {
      const result = truncateDiff("x".repeat(200), "", 50, "head-tail");
      expect(result.truncated).toBe(true);
      expect(result.before.length).toBeLessThanOrEqual(50);
      expect(result.after).toBe("");
    });
  });

  test("large snapshot diff triggers truncation in findings", () => {
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      lines.push(`-  field${i}: "value${i}"`);
    }
    for (let i = 0; i < 200; i++) {
      lines.push(`+  field${i}: "changed${i}"`);
    }

    const diff = [
      "diff --git a/__snapshots__/big.test.ts.snap b/__snapshots__/big.test.ts.snap",
      "--- a/__snapshots__/big.test.ts.snap",
      "+++ b/__snapshots__/big.test.ts.snap",
      "@@ -1,200 +1,200 @@",
      ...lines,
    ].join("\n");

    const findings = detectSnapshotChanges(parseDiff(diff), {
      maxDiffSizeForLLM: 500,
    });
    expect(findings).toHaveLength(1);
    const totalSize = findings[0].before.length + findings[0].after.length;
    expect(totalSize).toBeLessThanOrEqual(600);
  });
});
