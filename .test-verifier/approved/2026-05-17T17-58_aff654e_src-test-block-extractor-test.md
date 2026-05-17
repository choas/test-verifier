---
id: tv_2026-05-17T17-58_aff654e_src-test-block-extractor-test
created_at: 2026-05-17T17:58:01Z
severity: SAFE
status: approved
llm_enriched: false
test_file: "src/test-block-extractor.test.ts"
test_functions:
  - "extracts a simple test block"
  - "extracts it() blocks"
  - "extracts describe blocks with nested tests"
  - "detects skip annotation"
  - "detects todo annotation"
  - "detects skipIf annotation"
  - "captures negated matchers"
  - "captures multiple assertions"
  - "captures line ranges"
  - "captures body source"
  - "handles describe.skip"
  - "handles resolves/rejects chains"
  - "handles nested describes"
  - "handles empty test file"
  - "handles file with imports only"
  - "handles 3-level nested describes with assertions at leaf"
  - "handles mixed nesting: tests at multiple levels"
  - "handles nested describe with skip at parent level"
  - "handles non-ASCII test names"
  - "handles multi-line assertion chains"
  - "handles resolves.not chain"
  - "extracts assert.equal as assertion"
  - "extracts multiple node:assert methods"
  - "extracts bare assert() call"
  - "extracts mixed expect and assert assertions"
  - "extracts assert.strictEqual and assert.throws"
  - "handles multiple sibling describes"
  - "returns before and after blocks"
  - "detects assertion removal"
  - "detects test deletion"
prod_files_related:
  - "src/rules/tautology-detector.ts"
  - "src/test-block-extractor.ts"
commit: aff654e19cd0d8b7d452167552a59d5e68ef9bec
parent_commit: 973d93f0bd5ff9da97d0f8278bd32d13849771e5
diff_hash: sha256:97b6578381a1b54f58a22de384a1d9c17abedec4f4e194861c0a8615bac53a01
---

# Test change in `src/test-block-extractor.test.ts`

## Findings (rule engine)

- **SAFE** 5 new test(s) added without modifying existing tests

## Diff

```diff
diff --git a/src/test-block-extractor.test.ts b/src/test-block-extractor.test.ts
index 917e630..c135e37 100644
--- a/src/test-block-extractor.test.ts
+++ b/src/test-block-extractor.test.ts
@@ -338,6 +338,73 @@ test('async negation', async () => {
     expect(blocks[0].assertions[0].matcher).toBe("resolves.not.toBe");
   });
 
+  test("extracts assert.equal as assertion", () => {
+    const source = `
+test('uses node:assert', () => {
+  const result = add(1, 2);
+  assert.equal(result, 3);
+});
+`;
+    const blocks = extractTestBlocks(source);
+    expect(blocks).toHaveLength(1);
+    expect(blocks[0].assertions).toHaveLength(1);
+    expect(blocks[0].assertions[0].matcher).toBe("assert.equal");
+  });
+
+  test("extracts multiple node:assert methods", () => {
+    const source = `
+test('multiple assert calls', () => {
+  assert.ok(result);
+  assert.equal(result.status, 200);
+  assert.deepEqual(result.body, { id: 1 });
+  assert.match(result.message, /success/);
+});
+`;
+    const blocks = extractTestBlocks(source);
+    expect(blocks[0].assertions).toHaveLength(4);
+    expect(blocks[0].assertions[0].matcher).toBe("assert.ok");
+    expect(blocks[0].assertions[1].matcher).toBe("assert.equal");
+    expect(blocks[0].assertions[2].matcher).toBe("assert.deepEqual");
+    expect(blocks[0].assertions[3].matcher).toBe("assert.match");
+  });
+
+  test("extracts bare assert() call", () => {
+    const source = `
+test('bare assert', () => {
+  assert(value !== null);
+});
+`;
+    const blocks = extractTestBlocks(source);
+    expect(blocks[0].assertions).toHaveLength(1);
+    expect(blocks[0].assertions[0].matcher).toBe("assert");
+  });
+
+  test("extracts mixed expect and assert assertions", () => {
+    const source = `
+test('mixed assertions', () => {
+  expect(a).toBe(1);
+  assert.equal(b, 2);
+});
+`;
+    const blocks = extractTestBlocks(source);
+    expect(blocks[0].assertions).toHaveLength(2);
+    expect(blocks[0].assertions[0].matcher).toBe("toBe");
+    expect(blocks[0].assertions[1].matcher).toBe("assert.equal");
+  });
+
+  test("extracts assert.strictEqual and assert.throws", () => {
+    const source = `
+test('strict and throws', () => {
+  assert.strictEqual(result, 42);
+  assert.throws(() => badFn(), /error/);
+});
+`;
+    const blocks = extractTestBlocks(source);
+    expect(blocks[0].assertions).toHaveLength(2);
+    expect(blocks[0].assertions[0].matcher).toBe("assert.strictEqual");
+    expect(blocks[0].assertions[1].matcher).toBe("assert.throws");
+  });
+
   test("handles multiple sibling describes", () => {
     const source = `
 describe('module A', () => {
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

auto-approved by policy
rationale: severity SAFE is in autoApprove list
