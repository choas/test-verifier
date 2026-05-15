---
id: tv_2026-05-03T11-19_5a8189a_src-rules-skip-detector-test
created_at: 2026-05-03T11:19:00Z
severity: CRITICAL
status: approved
llm_enriched: true
llm_model: gemma4:31b-cloud
test_file: "src/rules/skip-detector.test.ts"
test_functions:
  - "detects it() → it.skip()"
  - "detects it() → it.todo()"
  - "detects test() → test.skip()"
  - "detects test() → test.skipIf()"
  - "detects describe.skip()"
  - "detects un-skipping (it.skip → it) as SAFE"
  - "detects un-todo (it.todo → it) as SAFE"
  - "no findings when skip state unchanged"
  - "no findings when already-skipped test stays skipped"
  - "detects skip type change (.skip → .todo)"
  - "new test added with .skip is flagged"
  - "new test added without skip is not flagged"
  - "respects custom severity from config"
  - "respects custom todo severity from config"
  - "handles multiple changes in one file"
  - "handles nested test blocks inside describe"
  - "reports correct line number"
  - "empty before and after produces no findings"
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:b066f23526b303ca323da52c6eda23bb203c57a99da766bb471b49192038078e
---

# Test change in `src/rules/skip-detector.test.ts`

## Findings (rule engine)

- **CRITICAL** Assertion "toBe" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement
- **CRITICAL** Assertion "toContain" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement
- **CRITICAL** Assertion "toBe" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement
- **CRITICAL** Assertion "toContain" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement
- **CRITICAL** Assertion "toBe" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement
- **CRITICAL** Assertion "toContain" removed from test "detectSkipChanges > handles multiple changes in one file" without replacement

## Diff

```diff
diff --git a/src/rules/skip-detector.test.ts b/src/rules/skip-detector.test.ts
index 1bd1af3..217cd73 100644
--- a/src/rules/skip-detector.test.ts
+++ b/src/rules/skip-detector.test.ts
@@ -1,6 +1,6 @@
 import { describe, test, expect } from "bun:test";
 import { detectSkipChanges } from "./skip-detector";
-import { extractTestBlocksPair, extractTestBlocks } from "../test-block-extractor";
+import { extractTestBlocksPair } from "../test-block-extractor";
 import { Severity } from "../types";
 import { defineConfig } from "../config";
 
@@ -293,16 +293,16 @@ it('test-c', () => { expect(3).toBe(3); });
     expect(findings).toHaveLength(3);
 
     const skipFinding = findings.find((f) => f.message.includes("test-a"));
-    expect(skipFinding!.severity).toBe(Severity.CRITICAL);
-    expect(skipFinding!.message).toContain(".skip");
+    expect(skipFinding?.severity).toBe(Severity.CRITICAL);
+    expect(skipFinding?.message).toContain(".skip");
 
     const todoFinding = findings.find((f) => f.message.includes("test-b"));
-    expect(todoFinding!.severity).toBe(Severity.CRITICAL);
-    expect(todoFinding!.message).toContain(".todo");
+    expect(todoFinding?.severity).toBe(Severity.CRITICAL);
+    expect(todoFinding?.message).toContain(".todo");
 
     const unskipFinding = findings.find((f) => f.message.includes("test-c"));
-    expect(unskipFinding!.severity).toBe(Severity.SAFE);
-    expect(unskipFinding!.message).toContain("re-enabled");
+    expect(unskipFinding?.severity).toBe(Severity.SAFE);
+    expect(unskipFinding?.message).toContain("re-enabled");
   });
 
   test("handles nested test blocks inside describe", () => {
```

## Analysis

**Summary:** The test changes replace non-null assertions (!) with optional chaining (?.) in expectations, which potentially allows tests to pass if the findings are undefined.

**Risk Assessment:** SUSPICIOUS

**Concerns:**
- Replacing 'skipFinding!' with 'skipFinding?' means that if the finding is not found (undefined), the expression evaluates to 'undefined'. In many test frameworks, 'expect(undefined).toBe(Severity.CRITICAL)' will fail, but if the matcher is loose or the environment handles undefineds silently, it could mask a failure to find the expected object.
- The rule engine flagged these as removed assertions because the strictness of the non-null assertion was removed, effectively changing the test from 'must exist and have this value' to 'if it exists, it should have this value' (depending on the matcher's behavior with undefined).

**Recommendation:** Verify if the test framework (Bun) treats 'expect(undefined).toBe(value)' as a failure. If so, this is a minor refactor; if not, restore the non-null assertions or add explicit 'expect(skipFinding).toBeDefined()' calls to ensure the findings are actually present.

## Decision

approved by 138015+choas@users.noreply.github.com
rationale: False positive: formatting changes only
signature: ed25519:61uWGVpJbnp9UDlF3PNlcb0Jhz0+EE6QsEmuCqZ4RoRusW1PgedG5ktIfowWERR8Rblz2ZN8JE5c6lFN61npDQ==
