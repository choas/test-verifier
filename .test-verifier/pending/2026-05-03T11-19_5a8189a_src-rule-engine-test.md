---
id: tv_2026-05-03T11-19_5a8189a_src-rule-engine-test
created_at: 2026-05-03T11:19:00Z
severity: CRITICAL
status: pending
llm_enriched: false
test_file: "src/rule-engine.test.ts"
test_functions:
  - "returns SAFE for empty findings"
  - "returns the highest severity among findings"
  - "returns SUSPICIOUS when no CRITICAL present"
  - "returns LOW when only SAFE and LOW present"
  - "returns SAFE for single SAFE finding"
  - "detects skip + matcher transition on the same file"
  - "detects tautology and value change together"
  - "classifies new test file as SAFE when no issues found"
  - "detects assertion removal + value change on complex diff"
  - "respects assertionRemoved severity override"
  - "respects matcher transition table overrides"
  - "respects skip annotation severity override"
  - "respects tautology severity override"
  - "includes snapshot findings when diffs are provided"
  - "returns correct filePath in result"
  - "returns SAFE with no non-safe findings for identical content"
  - "handles multiple rules firing with overall severity as max"
  - "detects multi-assertion weakening in a single test"
  - "detects multi-assertion weakening across nested describes"
  - "detects combined weakening: assertion removal + matcher downgrade + skip"
  - "handles non-ASCII content in test names and values"
parent_verification_id: tv_2026-04-30T11-07_1813477_src-rule-engine-test
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:39060be0bf045b31a05adb04a0aec2275ed9e184714c5a51f22745792315e949
---

# Test change in `src/rule-engine.test.ts`

## Findings (rule engine)

- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns the highest severity among findings" without replacement
- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns SUSPICIOUS when no CRITICAL present" without replacement
- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns LOW when only SAFE and LOW present" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > detects multi-assertion weakening across nested describes" without replacement

## Diff

```diff
diff --git a/src/rule-engine.test.ts b/src/rule-engine.test.ts
index 948b2e3..0ed6458 100644
--- a/src/rule-engine.test.ts
+++ b/src/rule-engine.test.ts
@@ -5,7 +5,14 @@ import { defineConfig } from "./config";
 import type { FileDiff } from "./diff-parser";
 
 function finding(severity: Severity): Finding {
-  return { rule: "test", severity, line: 1, message: "", before: "", after: "" };
+  return {
+    rule: "test",
+    severity,
+    line: 1,
+    message: "",
+    before: "",
+    after: "",
+  };
 }
 
 describe("maxSeverity", () => {
@@ -15,28 +22,18 @@ describe("maxSeverity", () => {
 
   it("returns the highest severity among findings", () => {
     expect(
-      maxSeverity([
-        finding(Severity.LOW),
-        finding(Severity.CRITICAL),
-        finding(Severity.SAFE),
-      ]),
+      maxSeverity([finding(Severity.LOW), finding(Severity.CRITICAL), finding(Severity.SAFE)]),
     ).toBe(Severity.CRITICAL);
   });
 
   it("returns SUSPICIOUS when no CRITICAL present", () => {
     expect(
-      maxSeverity([
-        finding(Severity.SAFE),
-        finding(Severity.SUSPICIOUS),
-        finding(Severity.LOW),
-      ]),
+      maxSeverity([finding(Severity.SAFE), finding(Severity.SUSPICIOUS), finding(Severity.LOW)]),
     ).toBe(Severity.SUSPICIOUS);
   });
 
   it("returns LOW when only SAFE and LOW present", () => {
-    expect(
-      maxSeverity([finding(Severity.SAFE), finding(Severity.LOW)]),
-    ).toBe(Severity.LOW);
+    expect(maxSeverity([finding(Severity.SAFE), finding(Severity.LOW)])).toBe(Severity.LOW);
   });
 
   it("returns SAFE for single SAFE finding", () => {
@@ -189,7 +186,9 @@ describe("runRuleEngine", () => {
       filePath: "removal.test.ts",
       beforeContent: before,
       afterContent: after,
-      config: defineConfig({ rules: { assertionRemoved: Severity.SUSPICIOUS } }),
+      config: defineConfig({
+        rules: { assertionRemoved: Severity.SUSPICIOUS },
+      }),
     });
 
     expect(overrideResult.findings[0].severity).toBe(Severity.SUSPICIOUS);
@@ -214,13 +213,11 @@ describe("runRuleEngine", () => {
       beforeContent: before,
       afterContent: after,
       config: defineConfig({
-        rules: { matcherTransitions: { toBe: { toEqual: "LOW" } } },
+        rules: { matcherTransitions: { "toBe->toEqual": Severity.LOW } },
       }),
     });
 
-    const matcherFindings = result.findings.filter(
-      (f) => f.rule === "matcher-transition",
-    );
+    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
     expect(matcherFindings[0].severity).toBe(Severity.LOW);
   });
 
@@ -245,9 +242,7 @@ describe("runRuleEngine", () => {
       config: defineConfig({ rules: { skipAnnotation: Severity.SUSPICIOUS } }),
     });
 
-    const skipFindings = result.findings.filter((f) =>
-      f.rule.startsWith("skip-detector"),
-    );
+    const skipFindings = result.findings.filter((f) => f.rule.startsWith("skip-detector"));
     expect(skipFindings[0].severity).toBe(Severity.SUSPICIOUS);
   });
 
@@ -291,10 +286,30 @@ describe("runRuleEngine", () => {
           newCount: 3,
           header: "",
           lines: [
-            { type: "context", content: "exports[`app renders`] = `", oldLineNumber: 1, newLineNumber: 1 },
-            { type: "removed", content: "<div>old</div>", oldLineNumber: 2, newLineNumber: null },
-            { type: "added", content: "<div>new</div>", oldLineNumber: null, newLineNumber: 2 },
-            { type: "context", content: "`;", oldLineNumber: 3, newLineNumber: 3 },
+            {
+              type: "context",
+              content: "exports[`app renders`] = `",
+              oldLineNumber: 1,
+              newLineNumber: 1,
+            },
+            {
+              type: "removed",
+              content: "<div>old</div>",
+              oldLineNumber: 2,
+              newLineNumber: null,
+            },
+            {
+              type: "added",
+              content: "<div>new</div>",
+              oldLineNumber: null,
+              newLineNumber: 2,
+            },
+            {
+              type: "context",
+              content: "`;",
+              oldLineNumber: 3,
+              newLineNumber: 3,
+            },
           ],
         },
       ],
@@ -461,9 +476,9 @@ describe("runRuleEngine", () => {
     expect(
       matcherFindings.some((f) => f.message.includes("auth > login > validates credentials")),
     ).toBe(true);
-    expect(
-      matcherFindings.some((f) => f.message.includes("auth > logout > clears session")),
-    ).toBe(true);
+    expect(matcherFindings.some((f) => f.message.includes("auth > logout > clears session"))).toBe(
+      true,
+    );
     expect(result.overallSeverity).toBe(Severity.CRITICAL);
   });
 
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

(Empty until enrichment is complete and a human approves or rejects.)
