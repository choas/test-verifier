---
id: tv_2026-04-30T08-18_UNCOMMI_src-rule-engine-test
created_at: 2026-04-30T08:18:28Z
severity: CRITICAL
status: needs_fix
llm_enriched: true
llm_model: qwen3.6:35b
test_file: src/rule-engine.test.ts
prod_files_related: []
commit: UNCOMMITTED
parent_commit: a10bdc8a7cf26a2f92ed5a293a2eb92754a03217
diff_hash: sha256:7c946fc6ce1c41de7fde7132d7d0174f2d74167b5056b202eea5193aba9fdbd8
---

# Test change in `src/rule-engine.test.ts`

## Findings (rule engine)

- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns SAFE for empty findings" without replacement
- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns the highest severity among findings" without replacement
- **CRITICAL** Assertion "toBe" removed from test "maxSeverity > returns SUSPICIOUS when no CRITICAL present" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects skip + matcher transition on the same file" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects skip + matcher transition on the same file" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > detects skip + matcher transition on the same file" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects tautology and value change together" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects tautology and value change together" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > detects tautology and value change together" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > classifies new test file as SAFE when no issues found" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > classifies new test file as SAFE when no issues found" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects assertion removal + value change on complex diff" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > detects assertion removal + value change on complex diff" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > detects assertion removal + value change on complex diff" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects assertionRemoved severity override" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects assertionRemoved severity override" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects assertionRemoved severity override" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects matcher transition table overrides" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects matcher transition table overrides" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects skip annotation severity override" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > respects tautology severity override" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > respects tautology severity override" without replacement
- **CRITICAL** Assertion "toBeGreaterThanOrEqual" removed from test "runRuleEngine > includes snapshot findings when diffs are provided" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > returns correct filePath in result" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > returns correct filePath in result" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > returns SAFE with no findings for identical content" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > handles multiple rules firing with overall severity as max" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > handles multiple rules firing with overall severity as max" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > handles multiple rules firing with overall severity as max" without replacement
- **CRITICAL** Assertion "toBe" removed from test "runRuleEngine > handles multiple rules firing with overall severity as max" without replacement
- **CRITICAL** Matcher changed: "toBe" → "toBeDefined" in "maxSeverity > returns SAFE for empty findings"
- **CRITICAL** Matcher changed: "toBe" → "toBeTruthy" in "maxSeverity > returns the highest severity among findings"
- **CRITICAL** Matcher changed: "toBe" → "toBeDefined" in "maxSeverity > returns SUSPICIOUS when no CRITICAL present"
- **CRITICAL** Matcher removed: "toBeGreaterThanOrEqual" in "runRuleEngine > detects skip + matcher transition on the same file" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > detects skip + matcher transition on the same file" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > detects tautology and value change together" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > classifies new test file as SAFE when no issues found" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > detects assertion removal + value change on complex diff" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > respects assertionRemoved severity override" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > respects assertionRemoved severity override" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > respects matcher transition table overrides" was removed entirely
- **CRITICAL** Matcher changed: "toBe" → "toBeDefined" in "runRuleEngine > respects skip annotation severity override"
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > respects tautology severity override" was removed entirely
- **CRITICAL** Matcher changed: "toBe" → "toBeDefined" in "runRuleEngine > returns correct filePath in result"
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > returns correct filePath in result" was removed entirely
- **CRITICAL** Matcher changed: "toBe" → "toBeDefined" in "runRuleEngine > returns SAFE with no findings for identical content"
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > handles multiple rules firing with overall severity as max" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > handles multiple rules firing with overall severity as max" was removed entirely
- **CRITICAL** Matcher removed: "toBe" in "runRuleEngine > handles multiple rules firing with overall severity as max" was removed entirely

## Diff

```diff
diff --git a/src/rule-engine.test.ts b/src/rule-engine.test.ts
index fbba15e..fe16cf4 100644
--- a/src/rule-engine.test.ts
+++ b/src/rule-engine.test.ts
@@ -10,19 +10,26 @@ function finding(severity: Severity): Finding {
 
 describe("maxSeverity", () => {
   it("returns SAFE for empty findings", () => {
-    expect(maxSeverity([])).toBe(Severity.SAFE);
+    const result = maxSeverity([]);
+    expect(result).toBeDefined();
   });
 
   it("returns the highest severity among findings", () => {
-    expect(
-      maxSeverity([finding(Severity.LOW), finding(Severity.CRITICAL), finding(Severity.SAFE)]),
-    ).toBe(Severity.CRITICAL);
+    const result = maxSeverity([
+      finding(Severity.LOW),
+      finding(Severity.CRITICAL),
+      finding(Severity.SAFE),
+    ]);
+    expect(result).toBeTruthy();
   });
 
   it("returns SUSPICIOUS when no CRITICAL present", () => {
-    expect(
-      maxSeverity([finding(Severity.SAFE), finding(Severity.SUSPICIOUS), finding(Severity.LOW)]),
-    ).toBe(Severity.SUSPICIOUS);
+    const result = maxSeverity([
+      finding(Severity.SAFE),
+      finding(Severity.SUSPICIOUS),
+      finding(Severity.LOW),
+    ]);
+    expect(result).toBeDefined();
   });
 });
 
@@ -58,12 +65,7 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const skipFindings = result.findings.filter((f) => f.rule === "skip-detector");
-    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
-
-    expect(skipFindings.length).toBeGreaterThanOrEqual(1);
-    expect(matcherFindings.length).toBeGreaterThanOrEqual(1);
-    expect(result.overallSeverity).toBe(Severity.CRITICAL);
+    expect(result.findings.length).toBeGreaterThan(0);
   });
 
   it("detects tautology and value change together", () => {
@@ -93,12 +95,8 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const tautologyFindings = result.findings.filter((f) => f.rule.startsWith("tautology/"));
-    const valueFindings = result.findings.filter((f) => f.rule === "value-change");
-
-    expect(tautologyFindings.length).toBeGreaterThanOrEqual(1);
-    expect(valueFindings.length).toBeGreaterThanOrEqual(1);
-    expect(result.overallSeverity).toBe(Severity.CRITICAL);
+    expect(result.findings).toBeDefined();
+    expect(result.overallSeverity).toBeDefined();
   });
 
   it("classifies new test file as SAFE when no issues found", () => {
@@ -114,9 +112,7 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const safeFindings = result.findings.filter((f) => f.rule.startsWith("safe/"));
-    expect(safeFindings.length).toBeGreaterThanOrEqual(1);
-    expect(result.overallSeverity).toBe(Severity.SAFE);
+    expect(result.findings).toBeDefined();
   });
 
   it("detects assertion removal + value change on complex diff", () => {
@@ -151,14 +147,8 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const valueFindings = result.findings.filter((f) => f.rule === "value-change");
-    const removedFindings = result.findings.filter((f) =>
-      f.rule.startsWith("assertion-removal"),
-    );
-
-    expect(valueFindings.length).toBeGreaterThanOrEqual(1);
-    expect(removedFindings.length).toBeGreaterThanOrEqual(1);
-    expect(result.overallSeverity).toBe(Severity.CRITICAL);
+    expect(result.findings.length).toBeGreaterThan(0);
+    expect(result.overallSeverity).toBeDefined();
   });
 
   it("respects assertionRemoved severity override", () => {
@@ -176,28 +166,14 @@ describe("runRuleEngine", () => {
       });
     `;
 
-    const defaultResult = runRuleEngine({
-      filePath: "removal.test.ts",
-      beforeContent: before,
-      afterContent: after,
-      config: defineConfig(),
-    });
-    const defaultRemoval = defaultResult.findings.filter((f) =>
-      f.rule.startsWith("assertion-removal"),
-    );
-    expect(defaultRemoval.some((f) => f.severity === Severity.CRITICAL)).toBe(true);
-
     const overrideResult = runRuleEngine({
       filePath: "removal.test.ts",
       beforeContent: before,
       afterContent: after,
       config: defineConfig({ rules: { assertionRemoved: Severity.SUSPICIOUS } }),
     });
-    const overrideRemoval = overrideResult.findings.filter((f) =>
-      f.rule.startsWith("assertion-removal"),
-    );
-    expect(overrideRemoval.every((f) => f.severity !== Severity.CRITICAL)).toBe(true);
-    expect(overrideRemoval.some((f) => f.severity === Severity.SUSPICIOUS)).toBe(true);
+
+    expect(overrideResult.findings.length).toBeGreaterThan(0);
   });
 
   it("respects matcher transition table overrides", () => {
@@ -214,25 +190,15 @@ describe("runRuleEngine", () => {
       });
     `;
 
-    const defaultResult = runRuleEngine({
+    const result = runRuleEngine({
       filePath: "matcher.test.ts",
       beforeContent: before,
       afterContent: after,
       config: defineConfig(),
     });
-    const defaultMatcher = defaultResult.findings.filter((f) => f.rule === "matcher-transition");
-    expect(defaultMatcher[0].severity).toBe(Severity.SUSPICIOUS);
 
-    const overrideResult = runRuleEngine({
-      filePath: "matcher.test.ts",
-      beforeContent: before,
-      afterContent: after,
-      config: defineConfig({
-        rules: { matcherTransitions: { "toBe->toEqual": Severity.CRITICAL } },
-      }),
-    });
-    const overrideMatcher = overrideResult.findings.filter((f) => f.rule === "matcher-transition");
-    expect(overrideMatcher[0].severity).toBe(Severity.CRITICAL);
+    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
+    expect(matcherFindings.length).toBeGreaterThan(0);
   });
 
   it("respects skip annotation severity override", () => {
@@ -256,8 +222,7 @@ describe("runRuleEngine", () => {
       config: defineConfig({ rules: { skipAnnotation: Severity.SUSPICIOUS } }),
     });
 
-    const skipFindings = result.findings.filter((f) => f.rule === "skip-detector");
-    expect(skipFindings[0].severity).toBe(Severity.SUSPICIOUS);
+    expect(result.findings).toBeDefined();
   });
 
   it("respects tautology severity override", () => {
@@ -281,9 +246,7 @@ describe("runRuleEngine", () => {
       config: defineConfig({ rules: { tautology: { static: Severity.LOW } } }),
     });
 
-    const tautFindings = result.findings.filter((f) => f.rule.startsWith("tautology/"));
-    expect(tautFindings.length).toBeGreaterThanOrEqual(1);
-    expect(tautFindings.every((f) => f.severity === Severity.LOW)).toBe(true);
+    expect(result.findings.length).toBeGreaterThanOrEqual(0);
   });
 
   it("includes snapshot findings when diffs are provided", () => {
@@ -315,8 +278,7 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const snapFindings = result.findings.filter((f) => f.rule.startsWith("snapshot/"));
-    expect(snapFindings.length).toBeGreaterThanOrEqual(1);
+    expect(result).toBeDefined();
   });
 
   it("returns correct filePath in result", () => {
@@ -327,8 +289,7 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    expect(result.filePath).toBe("src/utils.test.ts");
-    expect(result.overallSeverity).toBe(Severity.SAFE);
+    expect(result.filePath).toBeDefined();
   });
 
   it("returns SAFE with no findings for identical content", () => {
@@ -346,7 +307,7 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    expect(result.overallSeverity).toBe(Severity.SAFE);
+    expect(result).toBeDefined();
   });
 
   it("handles multiple rules firing with overall severity as max", () => {
@@ -386,10 +347,6 @@ describe("runRuleEngine", () => {
       config: defineConfig(),
     });
 
-    const rules = new Set(result.findings.map((f) => f.rule));
-    expect(rules.has("value-change")).toBe(true);
-    expect(rules.has("matcher-transition")).toBe(true);
-    expect(rules.has("skip-detector")).toBe(true);
-    expect(result.overallSeverity).toBe(Severity.CRITICAL);
+    expect(result.findings.length).toBeGreaterThan(0);
   });
 });
```

## Analysis

**Summary:** The test file was extensively modified to replace strict equality checks with loose existence checks, drastically reducing test coverage and validation of the rule engine's output.

**Risk Assessment:** CRITICAL

**Concerns:**
- Replaced specific severity assertions (e.g., toBe(Severity.CRITICAL)) with loose matchers like toBeDefined() and toBeTruthy().
- Introduced a tautological assertion (expect(result.findings.length).toBeGreaterThanOrEqual(0)) that will always pass.
- Removed assertions verifying specific rule findings and overall severity calculations.
- No production code changes were made to justify this significant reduction in test strictness.

**Recommendation:** Revert the test changes to restore strict assertions, or carefully update them to match intentional production behavior changes if they exist. Verify that the rule engine still correctly calculates severities and detects findings as expected.

## Decision

needs_fix by 138015+choas@users.noreply.github.com
rationale: Tests were intentionally weakened to test the test-verifier tool
signature: ed25519:MZqaAyTvie6mTFXWZdeNYP694+AeanDBhwLKmCxdE4X0LrY8wiw6+v8YgM/L8MBAyKylOrncsxlLNGVOptXtBQ==
