---
id: tv_2026-05-03T11-18_5a8189a_src-crypto-sign-verify-test
created_at: 2026-05-03T11:18:59Z
severity: CRITICAL
status: approved
llm_enriched: true
llm_model: gemma4:31b-cloud
test_file: "src/crypto/sign-verify.test.ts"
test_functions:
  - "produces deterministic output"
  - "includes both diffHash and decisionText"
  - "signature verifies with matching public key"
  - "signature fails with wrong public key"
  - "signature fails with tampered diffHash"
  - "signature fails with tampered decisionText"
  - "signature is base64 encoded"
  - "extracts key-value pairs"
  - "throws on missing front matter"
  - "extracts decision text"
  - "throws on missing section"
  - "signs a stub file and verifies it"
  - "verification fails with wrong key"
  - "verification fails if decision text is tampered"
  - "verification fails if front matter hash is tampered"
  - "throws if file has no diff_hash"
  - "throws if signed file has no signature"
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:92e4500991b65460dc6491b9707d6e380ee14ccfcd12713f6a3f45ddec74be96
---

# Test change in `src/crypto/sign-verify.test.ts`

## Findings (rule engine)

- **CRITICAL** Assertion "toBe" removed from test "parseFrontMatter > extracts key-value pairs" without replacement
- **CRITICAL** Assertion "toBe" removed from test "parseFrontMatter > extracts key-value pairs" without replacement
- **CRITICAL** Assertion "toBe" removed from test "parseFrontMatter > extracts key-value pairs" without replacement
- **CRITICAL** Assertion "toThrow" removed from test "signFile and verifyFile roundtrip > throws if file has no diff_hash" without replacement

## Diff

```diff
diff --git a/src/crypto/sign-verify.test.ts b/src/crypto/sign-verify.test.ts
index 0559d6d..20cf090 100644
--- a/src/crypto/sign-verify.test.ts
+++ b/src/crypto/sign-verify.test.ts
@@ -47,21 +47,30 @@ Risk: HIGH. Disabling a security-critical test.
 
 describe("canonicalize", () => {
   test("produces deterministic output", () => {
-    const input = { diffHash: "sha256:abc123", decisionText: "approved by dev@example.com" };
+    const input = {
+      diffHash: "sha256:abc123",
+      decisionText: "approved by dev@example.com",
+    };
     const a = canonicalize(input);
     const b = canonicalize(input);
     expect(a.equals(b)).toBe(true);
   });
 
   test("includes both diffHash and decisionText", () => {
-    const buf = canonicalize({ diffHash: "sha256:abc", decisionText: "rationale: ok" });
+    const buf = canonicalize({
+      diffHash: "sha256:abc",
+      decisionText: "rationale: ok",
+    });
     const str = buf.toString("utf-8");
     expect(str).toBe("sha256:abc\nrationale: ok");
   });
 });
 
 describe("sign and verify roundtrip", () => {
-  const input = { diffHash: "sha256:deadbeef", decisionText: "approved by alice@co.com\nrationale: looks good" };
+  const input = {
+    diffHash: "sha256:deadbeef",
+    decisionText: "approved by alice@co.com\nrationale: looks good",
+  };
 
   test("signature verifies with matching public key", () => {
     const sig = sign(kp.privateKey, input);
@@ -84,7 +93,10 @@ describe("sign and verify roundtrip", () => {
 
   test("signature fails with tampered decisionText", () => {
     const sig = sign(kp.privateKey, input);
-    const tampered = { ...input, decisionText: "approved by mallory@evil.com\nrationale: trust me" };
+    const tampered = {
+      ...input,
+      decisionText: "approved by mallory@evil.com\nrationale: trust me",
+    };
     expect(verify(kp.publicKey, tampered, sig)).toBe(false);
   });
 
@@ -98,9 +110,11 @@ describe("sign and verify roundtrip", () => {
 describe("parseFrontMatter", () => {
   test("extracts key-value pairs", () => {
     const fm = parseFrontMatter(STUB_FILE);
-    expect(fm["id"]).toBe("tv_2026-04-29T14-21_abc1234_auth-validate-test");
-    expect(fm["severity"]).toBe("CRITICAL");
-    expect(fm["diff_hash"]).toBe("sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
+    expect(fm.id).toBe("tv_2026-04-29T14-21_abc1234_auth-validate-test");
+    expect(fm.severity).toBe("CRITICAL");
+    expect(fm.diff_hash).toBe(
+      "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
+    );
   });
 
   test("throws on missing front matter", () => {
@@ -121,7 +135,13 @@ describe("parseDecisionSection", () => {
 
 describe("signFile and verifyFile roundtrip", () => {
   test("signs a stub file and verifies it", () => {
-    const signed = signFile(kp.privateKey, STUB_FILE, "approved", "dev@example.com", "safe to skip, covered by integration tests");
+    const signed = signFile(
+      kp.privateKey,
+      STUB_FILE,
+      "approved",
+      "dev@example.com",
+      "safe to skip, covered by integration tests",
+    );
     expect(signed).toContain("## Decision

approved by 138015+choas@users.noreply.github.com
rationale: auto-approved: LLM risk assessment is SAFE — The changes are purely cosmetic formatting updates (likely from the newly added Biome formatter) and do not remove or weaken any assertions.
signature: ed25519:nI3xY0VxUnkI85xwM6hF+dXk0ASbxw09FMps9QclnvMl/4uN8Ai3kbb6lqA8jn7Ta1vOEoYFiKkVAyVSZUxJAw==
