---
id: tv_2026-05-03T11-18_5a8189a_src-crypto-keys-test
created_at: 2026-05-03T11:18:59Z
severity: SAFE
status: approved
llm_enriched: false
test_file: "src/crypto/keys.test.ts"
test_functions:
  - "returns a deterministic 16-char hex string"
  - "different URLs produce different ids"
  - "produces valid Ed25519 PEM keys"
  - "stores and loads private key"
  - "private key file has mode 0600"
  - "loadPrivateKey returns null when missing"
  - "stores and loads public key"
  - "public key is written into repo .test-verifier/keys/"
  - "loadPublicKey returns null when missing"
  - "privateKeyPath uses HOME"
  - "publicKeyPath uses repo root"
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:f95d8ee254e0e956272ce503c73182dadad6eea08fff1f61e80a57472baa04cd
---

# Test change in `src/crypto/keys.test.ts`

## Findings (rule engine)

No findings.

## Diff

```diff
diff --git a/src/crypto/keys.test.ts b/src/crypto/keys.test.ts
index ff9d1c1..47ade76 100644
--- a/src/crypto/keys.test.ts
+++ b/src/crypto/keys.test.ts
@@ -1,5 +1,5 @@
 import { describe, test, expect, beforeEach, afterEach } from "bun:test";
-import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
+import { mkdtemp, rm, readFile } from "node:fs/promises";
 import { join } from "node:path";
 import { tmpdir } from "node:os";
 import { createPrivateKey, createPublicKey } from "node:crypto";
@@ -10,7 +10,6 @@ import {
   storePublicKey,
   loadPrivateKey,
   loadPublicKey,
-  privateKeyDir,
   privateKeyPath,
   publicKeyPath,
   privateKeyFileMode,
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

auto-approved by policy
rationale: severity SAFE is in autoApprove list
