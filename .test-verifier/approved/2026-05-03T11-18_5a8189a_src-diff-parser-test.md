---
id: tv_2026-05-03T11-18_5a8189a_src-diff-parser-test
created_at: 2026-05-03T11:18:59Z
severity: SAFE
status: approved
llm_enriched: false
test_file: "src/diff-parser.test.ts"
test_functions:
  - "returns empty array for empty string"
  - "parses a simple single-hunk diff"
  - "classifies added, removed, and context lines"
  - "tracks old line numbers for removed and context lines"
  - "tracks new line numbers for added and context lines"
  - "removed lines have null newLineNumber"
  - "added lines have null oldLineNumber"
  - "parses multiple hunks in a single file"
  - "parses multiple files"
  - "parses new file diff"
  - "parses deletions correctly"
  - "preserves hunk header function context"
  - "handles diff with no newline at end of file marker"
  - "line numbers advance correctly across mixed changes"
  - "hunk count of 1 is inferred when omitted"
  - "handles binary file diffs"
  - "handles new binary file diff"
  - "handles renamed file diff"
  - "handles renamed file with no content change"
  - "handles mode change diff"
  - "handles deleted file diff"
  - "handles quoted paths with spaces"
  - "handles non-ASCII content in diff lines"
  - "handles multi-file diff with binary and text files mixed"
  - "rejects path traversal in diff headers"
  - "rejects absolute paths in diff headers"
prod_files_related:
  - "package.json"
commit: 5a8189aa26c64016ad65b6b8cd125e17bc2e8254
parent_commit: c70a73fd5ad515a6739e2ba1069197c7b3593483
diff_hash: sha256:8262628df30c8d75762ee341e5c69bf46766f54ac6ddd3d81acd8dd408db202c
---

# Test change in `src/diff-parser.test.ts`

## Findings (rule engine)

- **SAFE** Changes only add or modify type annotations

## Diff

```diff
diff --git a/src/diff-parser.test.ts b/src/diff-parser.test.ts
index 5142f18..38568e2 100644
--- a/src/diff-parser.test.ts
+++ b/src/diff-parser.test.ts
@@ -1,6 +1,5 @@
 import { describe, test, expect } from "bun:test";
 import { parseDiff } from "./diff-parser";
-import type { FileDiff, DiffHunk, DiffLine } from "./diff-parser";
 
 const SIMPLE_DIFF = `diff --git a/src/utils.test.ts b/src/utils.test.ts
 index abc1234..def5678 100644
@@ -127,9 +126,7 @@ describe("parseDiff", () => {
   test("tracks new line numbers for added and context lines", () => {
     const hunk = parseDiff(SIMPLE_DIFF)[0].hunks[0];
 
-    const contextAndAdded = hunk.lines.filter(
-      (l) => l.type === "context" || l.type === "added",
-    );
+    const contextAndAdded = hunk.lines.filter((l) => l.type === "context" || l.type === "added");
     const newNumbers = contextAndAdded.map((l) => l.newLineNumber);
     expect(newNumbers).toEqual([1, 2, 3, 4, 5]);
   });
```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

auto-approved by policy
rationale: severity SAFE is in autoApprove list
