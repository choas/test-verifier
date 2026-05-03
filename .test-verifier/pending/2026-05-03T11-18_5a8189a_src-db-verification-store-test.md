---
id: tv_2026-05-03T11-18_5a8189a_src-db-verification-store-test
created_at: 2026-05-03T11:18:59Z
severity: CRITICAL
status: pending
llm_enriched: false
test_file: "src/db/verification-store.test.ts"
test_functions:
  - "getById returns null for nonexistent id"
  - "insert and retrieve by id"
  - "insert replaces existing record with same id"
  - "updateStatus changes status and reviewer info"
  - "findByTestFile returns matching records"
  - "findByTestFile returns empty for no matches"
  - "findByTestFileAndFunction matches function name in JSON array"
  - "findByStatus returns records with matching status"
  - "findNeedsFixForTestFile returns only needs_fix records"
  - "findNeedsFixForTestFunction filters by function name"
  - "getLineage follows parent chain"
  - "getLineage returns single record when no parent"
  - "getChildren returns child records"
  - "getChildren returns empty for no children"
  - "summary returns counts by status"
  - "summary returns all zeros for empty store"
  - "handles non-ASCII content in test file and function names"
  - "handles empty test_functions array"
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:d3a3b4ef9701a5c5a967dde97bfd09bd23a0cbf3a61014f682c18875c92846cd
---

# Test change in `src/db/verification-store.test.ts`

## Findings (rule engine)

- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toEqual" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert and retrieve by id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > insert replaces existing record with same id" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > updateStatus changes status and reviewer info" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > updateStatus changes status and reviewer info" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > updateStatus changes status and reviewer info" without replacement
- **CRITICAL** Assertion "toBe" removed from test "VerificationStore > handles non-ASCII content in test file and function names" without replacement
- **CRITICAL** Assertion "toEqual" removed from test "VerificationStore > handles non-ASCII content in test file and function names" without replacement
- **CRITICAL** Assertion "toEqual" removed from test "VerificationStore > handles empty test_functions array" without replacement

## Diff

```diff
diff --git a/src/db/verification-store.test.ts b/src/db/verification-store.test.ts
index 7409bf8..a7a3079 100644
--- a/src/db/verification-store.test.ts
+++ b/src/db/verification-store.test.ts
@@ -48,28 +48,28 @@ describe("VerificationStore", () => {
     store.insert(record);
     const result = store.getById("tv_test_001");
     expect(result).not.toBeNull();
-    expect(result!.id).toBe("tv_test_001");
-    expect(result!.testFile).toBe("src/utils.test.ts");
-    expect(result!.testFunctions).toEqual(["adds numbers", "subtracts"]);
-    expect(result!.severity).toBe(Severity.CRITICAL);
-    expect(result!.status).toBe("pending");
-    expect(result!.commit).toBe("abc1234");
+    expect(result?.id).toBe("tv_test_001");
+    expect(result?.testFile).toBe("src/utils.test.ts");
+    expect(result?.testFunctions).toEqual(["adds numbers", "subtracts"]);
+    expect(result?.severity).toBe(Severity.CRITICAL);
+    expect(result?.status).toBe("pending");
+    expect(result?.commit).toBe("abc1234");
   });
 
   test("insert replaces existing record with same id", () => {
     store.insert(makeRecord({ severity: Severity.LOW }));
     store.insert(makeRecord({ severity: Severity.CRITICAL }));
     const result = store.getById("tv_test_001");
-    expect(result!.severity).toBe(Severity.CRITICAL);
+    expect(result?.severity).toBe(Severity.CRITICAL);
   });
 
   test("updateStatus changes status and reviewer info", () => {
     store.insert(makeRecord());
     store.updateStatus("tv_test_001", "approved", "alice@test.com", "Looks good");
     const result = store.getById("tv_test_001");
-    expect(result!.status).toBe("approved");
-    expect(result!.reviewer).toBe("alice@test.com");
-    expect(result!.rationale).toBe("Looks good");
+    expect(result?.status).toBe("approved");
+    expect(result?.reviewer).toBe("alice@test.com");
+    expect(result?.rationale).toBe("Looks good");
   });
 
   test("findByTestFile returns matching records", () => {
@@ -88,7 +88,12 @@ describe("VerificationStore", () => {
   });
 
   test("findByTestFileAndFunction matches function name in JSON array", () => {
-    store.insert(makeRecord({ id: "tv_001", testFunctions: ["adds numbers", "multiplies"] }));
+    store.insert(
+      makeRecord({
+        id: "tv_001",
+        testFunctions: ["adds numbers", "multiplies"],
+      }),
+    );
     store.insert(makeRecord({ id: "tv_002", testFunctions: ["subtracts"] }));
 
     const results = store.findByTestFileAndFunction("src/utils.test.ts", "adds numbers");
@@ -119,16 +124,20 @@ describe("VerificationStore", () => {
   });
 
   test("findNeedsFixForTestFunction filters by function name", () => {
-    store.insert(makeRecord({
-      id: "tv_001",
-      status: "needs_fix",
-      testFunctions: ["adds numbers"],
-    }));
-    store.insert(makeRecord({
-      id: "tv_002",
-      status: "needs_fix",
-      testFunctions: ["subtracts"],
-    }));
+    store.insert(
+      makeRecord({
+        id: "tv_001",
+        status: "needs_fix",
+        testFunctions: ["adds numbers"],
+      }),
+    );
+    store.insert(
+      makeRecord({
+        id: "tv_002",
+        status: "needs_fix",
+        testFunctions: ["subtracts"],
+      }),
+    );
 
     const results = store.findNeedsFixForTestFunction("src/utils.test.ts", "adds numbers");
     expect(results).toHaveLength(1);
@@ -191,20 +200,22 @@ describe("VerificationStore", () => {
   });
 
   test("handles non-ASCII content in test file and function names", () => {
-    store.insert(makeRecord({
-      id: "tv_unicode",
-      testFile: "src/国際化.test.ts",
-      testFunctions: ["日本語テスト", "Ünïcödé test"],
-    }));
+    store.insert(
+      makeRecord({
+        id: "tv_unicode",
+        testFile: "src/国際化.test.ts",
+        testFunctions: ["日本語テスト", "Ünïcödé test"],
+      }),
+    );
 
     const result = store.getById("tv_unicode");
-    expect(result!.testFile).toBe("src/国際化.test.ts");
-    expect(result!.testFunctions).toEqual(["日本語テスト", "Ünïcödé test"]);
+    expect(result?.testFile).toBe("src/国際化.test.ts");
+    expect(result?.testFunctions).toEqual(["日本語テスト", "Ünïcödé test"]);
   });
 
   test("handles empty test_functions array", () => {
     store.insert(makeRecord({ id: "tv_empty", testFunctions: [] }));
     const result = store.getById("tv_empty");
-    expect(result!.testFunctions).toEqual([]);
+    expect(result?.testFunctions).toEqual([]);
   });
 });
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

(Empty until enrichment is complete and a human approves or rejects.)
