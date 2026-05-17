---
id: tv_2026-05-17T17-58_aff654e_src-rules-tautology-detector-test
created_at: 2026-05-17T17:58:01Z
severity: SAFE
status: approved
llm_enriched: false
test_file: "src/rules/tautology-detector.test.ts"
test_functions:
  - "flags expect(true).toBe(true)"
  - "flags expect(1).toBe(1)"
  - "flags expect('hello').toBe('hello')"
  - "flags expect(null).toBe(null)"
  - "flags expect(false).toEqual(false)"
  - "flags expect(1).toBe(2)"
  - "flags expect(true).toBe(false)"
  - "flags expect(x).toEqual(x)"
  - "flags expect(result).toBe(result)"
  - "flags expect(obj.prop).toEqual(obj.prop)"
  - "does not flag expect(a).toEqual(b)"
  - "flags test with no expect calls"
  - "flags empty test body"
  - "does not flag test with expect call"
  - "does not flag test with chained expect"
  - "does not flag test with resolves assertion"
  - "does not flag test with assert.equal"
  - "does not flag test with assert.ok"
  - "does not flag test with assert.deepEqual"
  - "does not flag test with assert.match"
  - "does not flag test with bare assert()"
  - "does not flag test with assert.strictEqual"
  - "does not flag test with assert.throws"
  - "flags mockReturnValue(true) on mock with non-trivial signature"
  - "flags mockResolvedValue({}) on mock with non-trivial signature"
  - "flags mockReturnValue with non-empty string"
  - "does not flag mockReturnValue(false)"
  - "does not flag mockReturnValue(0)"
  - "does not flag mock without non-trivial signature"
  - "uses CRITICAL by default"
  - "respects custom severity"
  - "detects multiple tautologies"
  - "does not flag legitimate assertions"
  - "handles it() blocks the same as test()"
  - "handles nested describe blocks"
  - "handles expect through .not chain for same identifier"
  - "populates line number and before fields"
prod_files_related:
  - "src/rules/tautology-detector.ts"
  - "src/test-block-extractor.ts"
commit: aff654e19cd0d8b7d452167552a59d5e68ef9bec
parent_commit: 973d93f0bd5ff9da97d0f8278bd32d13849771e5
diff_hash: sha256:49cc92701fcb29f511877073c903f47e113cd5ce338561de6b707c5d386848a4
---

# Test change in `src/rules/tautology-detector.test.ts`

## Findings (rule engine)

- **SAFE** 7 new test(s) added without modifying existing tests

## Diff

```diff
diff --git a/src/rules/tautology-detector.test.ts b/src/rules/tautology-detector.test.ts
index 0920693..0a01aaf 100644
--- a/src/rules/tautology-detector.test.ts
+++ b/src/rules/tautology-detector.test.ts
@@ -168,6 +168,70 @@ test('has chained assertion', () => {
       const source = `
 test('has async assertion', async () => {
   await expect(fetchData()).resolves.toBeDefined();
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.equal", () => {
+      const source = `
+test('uses node:assert', () => {
+  const result = add(1, 2);
+  assert.equal(result, 3);
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.ok", () => {
+      const source = `
+test('uses assert.ok', () => {
+  assert.ok(isValid());
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.deepEqual", () => {
+      const source = `
+test('uses assert.deepEqual', () => {
+  assert.deepEqual(getObj(), { a: 1 });
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.match", () => {
+      const source = `
+test('uses assert.match', () => {
+  assert.match(getMessage(), /hello/);
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with bare assert()", () => {
+      const source = `
+test('uses bare assert', () => {
+  assert(result !== null);
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.strictEqual", () => {
+      const source = `
+test('uses assert.strictEqual', () => {
+  assert.strictEqual(result, expected);
+});`;
+      const findings = detectTautologies(source);
+      expect(findings).toHaveLength(0);
+    });
+
+    test("does not flag test with assert.throws", () => {
+      const source = `
+test('uses assert.throws', () => {
+  assert.throws(() => riskyFn(), /error/);
 });`;
       const findings = detectTautologies(source);
       expect(findings).toHaveLength(0);
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

auto-approved by policy
rationale: severity SAFE is in autoApprove list
