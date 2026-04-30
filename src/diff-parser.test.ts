import { describe, test, expect } from "bun:test";
import { parseDiff } from "./diff-parser";
import type { FileDiff, DiffHunk, DiffLine } from "./diff-parser";

const SIMPLE_DIFF = `diff --git a/src/utils.test.ts b/src/utils.test.ts
index abc1234..def5678 100644
--- a/src/utils.test.ts
+++ b/src/utils.test.ts
@@ -1,5 +1,5 @@
 import { add } from "./utils";

 test("add", () => {
-  expect(add(1, 2)).toBe(3);
+  expect(add(1, 2)).toEqual(3);
 });`;

const MULTI_HUNK_DIFF = `diff --git a/src/math.test.ts b/src/math.test.ts
index aaa1111..bbb2222 100644
--- a/src/math.test.ts
+++ b/src/math.test.ts
@@ -2,7 +2,7 @@
 import { add, sub } from "./math";

 test("add", () => {
-  expect(add(1, 2)).toBe(3);
+  expect(add(1, 2)).toBeTruthy();
 });

 test("sub", () => {
@@ -15,4 +15,5 @@
 test("zero", () => {
   expect(add(0, 0)).toBe(0);
 });
+
+test("noop", () => {});`;

const MULTI_FILE_DIFF = `diff --git a/src/a.test.ts b/src/a.test.ts
index 111..222 100644
--- a/src/a.test.ts
+++ b/src/a.test.ts
@@ -1,3 +1,3 @@
 test("a", () => {
-  expect(1).toBe(1);
+  expect(1).toBeTruthy();
 });
diff --git a/src/b.test.ts b/src/b.test.ts
index 333..444 100644
--- a/src/b.test.ts
+++ b/src/b.test.ts
@@ -1,3 +1,4 @@
 test("b", () => {
   expect(2).toBe(2);
+  expect(3).toBe(3);
 });`;

const NEW_FILE_DIFF = `diff --git a/src/new.test.ts b/src/new.test.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.test.ts
@@ -0,0 +1,5 @@
+import { foo } from "./foo";
+
+test("foo returns bar", () => {
+  expect(foo()).toBe("bar");
+});`;

const DELETED_LINES_DIFF = `diff --git a/src/old.test.ts b/src/old.test.ts
index aaa..bbb 100644
--- a/src/old.test.ts
+++ b/src/old.test.ts
@@ -1,7 +1,4 @@
 test("first", () => {
-  const x = setup();
-  expect(x).toBeDefined();
-  expect(x.value).toBe(42);
   expect(true).toBe(true);
 });`;

describe("parseDiff", () => {
  test("returns empty array for empty string", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("  \n  ")).toEqual([]);
  });

  test("parses a simple single-hunk diff", () => {
    const files = parseDiff(SIMPLE_DIFF);
    expect(files).toHaveLength(1);

    const file = files[0];
    expect(file.oldPath).toBe("src/utils.test.ts");
    expect(file.newPath).toBe("src/utils.test.ts");
    expect(file.hunks).toHaveLength(1);

    const hunk = file.hunks[0];
    expect(hunk.oldStart).toBe(1);
    expect(hunk.oldCount).toBe(5);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newCount).toBe(5);
  });

  test("classifies added, removed, and context lines", () => {
    const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];

    const context = hunk.lines.filter((l) => l.type === "context");
    const added = hunk.lines.filter((l) => l.type === "added");
    const removed = hunk.lines.filter((l) => l.type === "removed");

    expect(context).toHaveLength(4);
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);

    expect(removed[0].content).toBe("  expect(add(1, 2)).toBe(3);");
    expect(added[0].content).toBe("  expect(add(1, 2)).toEqual(3);");
  });

  test("tracks old line numbers for removed and context lines", () => {
    const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];

    const contextAndRemoved = hunk.lines.filter(
      (l) => l.type === "context" || l.type === "removed",
    );
    const oldNumbers = contextAndRemoved.map((l) => l.oldLineNumber);
    expect(oldNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  test("tracks new line numbers for added and context lines", () => {
    const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];

    const contextAndAdded = hunk.lines.filter(
      (l) => l.type === "context" || l.type === "added",
    );
    const newNumbers = contextAndAdded.map((l) => l.newLineNumber);
    expect(newNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  test("removed lines have null newLineNumber", () => {
    const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];
    const removed = hunk.lines.filter((l) => l.type === "removed");
    for (const line of removed) {
      expect(line.newLineNumber).toBeNull();
    }
  });

  test("added lines have null oldLineNumber", () => {
    const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];
    const added = hunk.lines.filter((l) => l.type === "added");
    for (const line of added) {
      expect(line.oldLineNumber).toBeNull();
    }
  });

  test("parses multiple hunks in a single file", () => {
    const files = parseDiff(MULTI_HUNK_DIFF);
    expect(files).toHaveLength(1);
    expect(files[0].hunks).toHaveLength(2);

    const [hunk1, hunk2] = files[0].hunks;

    expect(hunk1.oldStart).toBe(2);
    expect(hunk1.newStart).toBe(2);

    expect(hunk2.oldStart).toBe(15);
    expect(hunk2.newStart).toBe(15);
    expect(hunk2.newCount).toBe(5);
  });

  test("parses multiple files", () => {
    const files = parseDiff(MULTI_FILE_DIFF);
    expect(files).toHaveLength(2);
    expect(files[0].oldPath).toBe("src/a.test.ts");
    expect(files[1].oldPath).toBe("src/b.test.ts");
  });

  test("parses new file diff", () => {
    const files = parseDiff(NEW_FILE_DIFF);
    expect(files).toHaveLength(1);

    const file = files[0];
    expect(file.newPath).toBe("src/new.test.ts");

    const hunk = file.hunks[0];
    expect(hunk.oldStart).toBe(0);
    expect(hunk.oldCount).toBe(0);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newCount).toBe(5);

    expect(hunk.lines).toHaveLength(5);
    expect(hunk.lines.every((l) => l.type === "added")).toBe(true);

    const newNumbers = hunk.lines.map((l) => l.newLineNumber);
    expect(newNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  test("parses deletions correctly", () => {
    const files = parseDiff(DELETED_LINES_DIFF);
    const hunk = files[0].hunks[0];

    const removed = hunk.lines.filter((l) => l.type === "removed");
    expect(removed).toHaveLength(3);
    expect(removed[0].content).toBe("  const x = setup();");
    expect(removed[0].oldLineNumber).toBe(2);
    expect(removed[1].oldLineNumber).toBe(3);
    expect(removed[2].oldLineNumber).toBe(4);
  });

  test("preserves hunk header function context", () => {
    const diff = `diff --git a/src/x.test.ts b/src/x.test.ts
index aaa..bbb 100644
--- a/src/x.test.ts
+++ b/src/x.test.ts
@@ -10,3 +10,3 @@ describe("math", () => {
   test("add", () => {
-    expect(add(1,2)).toBe(3);
+    expect(add(1,2)).toEqual(3);
   });`;

    const hunk = parseDiff(diff)[0].hunks[0];
    expect(hunk.header).toBe('describe("math", () => {');
  });

  test("handles diff with no newline at end of file marker", () => {
    const diff = `diff --git a/src/t.test.ts b/src/t.test.ts
index aaa..bbb 100644
--- a/src/t.test.ts
+++ b/src/t.test.ts
@@ -1,3 +1,3 @@
 test("x", () => {
-  expect(1).toBe(1);
+  expect(1).toBeTruthy();
 });
\\ No newline at end of file`;

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    const hunk = files[0].hunks[0];
    expect(hunk.lines).toHaveLength(4);
  });

  test("line numbers advance correctly across mixed changes", () => {
    const hunk = parseDiff(DELETED_LINES_DIFF)[0].hunks[0];

    // Line 1: context "test("first", () => {"  → old=1, new=1
    expect(hunk.lines[0]).toMatchObject({
      type: "context",
      oldLineNumber: 1,
      newLineNumber: 1,
    });

    // Lines 2-4: removed → old=2,3,4, new=null
    expect(hunk.lines[1]).toMatchObject({ type: "removed", oldLineNumber: 2 });
    expect(hunk.lines[2]).toMatchObject({ type: "removed", oldLineNumber: 3 });
    expect(hunk.lines[3]).toMatchObject({ type: "removed", oldLineNumber: 4 });

    // Line 5 of old / line 2 of new: context "  expect(true).toBe(true);"
    expect(hunk.lines[4]).toMatchObject({
      type: "context",
      oldLineNumber: 5,
      newLineNumber: 2,
    });

    // Line 6 of old / line 3 of new: context "});"
    expect(hunk.lines[5]).toMatchObject({
      type: "context",
      oldLineNumber: 6,
      newLineNumber: 3,
    });
  });

  test("hunk count of 1 is inferred when omitted", () => {
    const diff = `diff --git a/f.ts b/f.ts
index aaa..bbb 100644
--- a/f.ts
+++ b/f.ts
@@ -5 +5 @@
-old
+new`;

    const hunk = parseDiff(diff)[0].hunks[0];
    expect(hunk.oldCount).toBe(1);
    expect(hunk.newCount).toBe(1);
  });
});
