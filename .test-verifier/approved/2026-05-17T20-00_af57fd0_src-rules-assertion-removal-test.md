---
id: tv_2026-05-17T20-00_af57fd0_src-rules-assertion-removal-test
created_at: 2026-05-17T20:00:47Z
severity: SAFE
status: approved
llm_enriched: false
test_file: "src/rules/assertion-removal.test.ts"
test_functions:
  - "returns no findings when nothing changed"
  - "returns no findings when assertions are added"
  - "flags assertion removed from existing test as CRITICAL"
  - "flags entire test deletion as CRITICAL"
  - "flags assertion moved to another test as LOW"
  - "handles nested describe blocks"
  - "returns no findings when both before and after are empty"
  - "handles test renamed (old deleted, new added)"
  - "distinguishes removed vs moved when multiple assertions change"
  - "handles deeply nested describes"
  - "all assertions removed from test but test kept"
  - "does not flag when assertion text is reformatted"
  - "handles file with only describe deleted"
  - "handles new file (no before source)"
  - "does not flag trailing comma changes"
  - "does not flag non-null assertion changed to optional chaining"
  - "does not flag when inline comment is added"
  - "does not flag bracket to dot notation change"
prod_files_related:
  - "src/rules/assertion-removal.ts"
commit: af57fd0ce6ba404c3a01e19956a23cfb74de8fd5
parent_commit: aff654e19cd0d8b7d452167552a59d5e68ef9bec
diff_hash: sha256:86e3897c4ea0268c855a927ab2e791b9aff45143394958e182ee9bb44ebd316d
---

# Test change in `src/rules/assertion-removal.test.ts`

## Findings (rule engine)

- **SAFE** 4 new test(s) added without modifying existing tests

## Diff

```diff
diff --git a/src/rules/assertion-removal.test.ts b/src/rules/assertion-removal.test.ts
index 3e19e9b..c05e51a 100644
--- a/src/rules/assertion-removal.test.ts
+++ b/src/rules/assertion-removal.test.ts
@@ -279,6 +279,92 @@ describe('suite', () => {
 test('new test', () => {
   expect(1).toBe(1);
 });
+`;
+    const findings = detectAssertionRemoval({
+      beforeSource: before,
+      afterSource: after,
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  test("does not flag trailing comma changes", () => {
+    const before = `
+test('checks', () => {
+  expect(
+    maxSeverity([
+      finding(Severity.LOW),
+      finding(Severity.CRITICAL),
+    ]),
+  ).toBe(Severity.CRITICAL);
+});
+`;
+    const after = `
+test('checks', () => {
+  expect(
+    maxSeverity([finding(Severity.LOW), finding(Severity.CRITICAL)])
+  ).toBe(Severity.CRITICAL);
+});
+`;
+    const findings = detectAssertionRemoval({
+      beforeSource: before,
+      afterSource: after,
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  test("does not flag non-null assertion changed to optional chaining", () => {
+    const before = `
+test('checks', () => {
+  expect(result!.id).toBe("tv_test_001");
+  expect(result!.status).toBe("pending");
+});
+`;
+    const after = `
+test('checks', () => {
+  expect(result?.id).toBe("tv_test_001");
+  expect(result?.status).toBe("pending");
+});
+`;
+    const findings = detectAssertionRemoval({
+      beforeSource: before,
+      afterSource: after,
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  test("does not flag when inline comment is added", () => {
+    const before = `
+test('checks', () => {
+  expect(() => defineConfig({ rules: { assertionRemoved: "INVALID" as any } })).toThrow();
+});
+`;
+    const after = `
+test('checks', () => {
+  expect(() => defineConfig({
+    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
+    rules: { assertionRemoved: "INVALID" as any },
+  })).toThrow();
+});
+`;
+    const findings = detectAssertionRemoval({
+      beforeSource: before,
+      afterSource: after,
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  test("does not flag bracket to dot notation change", () => {
+    const before = `
+test('checks', () => {
+  expect(fm["id"]).toBe("test-id");
+  expect(fm["severity"]).toBe("CRITICAL");
+});
+`;
+    const after = `
+test('checks', () => {
+  expect(fm.id).toBe("test-id");
+  expect(fm.severity).toBe("CRITICAL");
+});
 `;
     const findings = detectAssertionRemoval({
       beforeSource: before,
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

auto-approved by policy
rationale: severity SAFE is in autoApprove list
