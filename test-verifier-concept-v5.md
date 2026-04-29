# Test Change Verifier: Concept v5

A TypeScript library for Bun-based SvelteKit projects that intercepts test file changes (mostly AI-generated), classifies each change by risk, runs an LLM-backed analysis, and produces one human-reviewable markdown file per affected test file per commit. Only humans can approve.

This revision incorporates:

- **Two-phase analysis**: rule engine runs at commit time (fast); LLM enrichment runs at push time (or on demand)
- **`relatedProdLookback` config**: how many commits back to gather production-code context for the LLM
- **Simplified key handling**: per-user Ed25519 keypairs, public keys in repo, no rotation tooling or status tracking for the MVP

## 1. Threat Model

The tool defends against one specific failure pattern: an AI agent (or a hurried human) "fixes" a failing test by changing the test rather than the production bug.

```ts
// Skip
it.skip('rejects expired tokens', ...)

// Weaken
expect(result).toBe(42)            → expect(result).toBeDefined()
expect(obj).toBe(reference)        → expect(obj).toEqual(reference)
expect(rows).toHaveLength(3)       → expect(rows).toBeDefined()

// Chase a buggy implementation
expect(calculateTax(100)).toBe(19) → expect(calculateTax(100)).toBe(0)

// Tautology
function very_very_critical_test() { return true }
expect(true).toBe(true)

// Swallow
try { expect(parseConfig(input)).toEqual(expected) } catch {}

// Delete edge cases silently
describe('edge cases', () => { /* three of four removed */ })

// Lie with the name
it('returns 401 for expired tokens', () => {
  expect(response.status).toBe(200)
})
```

Every test file edit is suspicious until proven otherwise.

## 2. Severity Taxonomy

Four tiers. Auto-approval threshold is configurable per project (default: `SAFE` only).

**SAFE.** New tests, new assertions added to existing tests, formatting, type annotations, identifier renames that do not change call targets.

**LOW.** Structural reorganization that demonstrably preserves coverage. Splitting a test, moving it between describes, extracting setup into beforeEach.

**SUSPICIOUS.** Behavior changed but not obviously weakened. Expected value changes, mock data changes, argument changes to the system under test, `toBe` to `toEqual`.

**CRITICAL.** Anything that reduces the suite's ability to detect regressions. Deleted tests, `.skip` / `.todo` / `.skipIf(true)`, commented-out assertions, removed assertions, matchers weakened across strictness bands, swallowing try/catch, mocks replaced with always-success stubs, unpaired snapshot updates, tautological assertions.

The matcher transition table and per-rule severities are configurable.

## 3. Two-Phase Analysis

The rule engine and the LLM analyzer run at different points in the workflow.

**Phase 1: Rule engine at commit time.** The pre-commit hook runs `bunx test-verifier check`. This parses the test file diffs, runs the rule engine, and writes **stub** pending markdown files containing the rule findings, the diff, and the front matter, but no LLM analysis section. This is fast (sub-second for typical commits, no network calls). The stub file's front matter has `llm_enriched: false`.

**Phase 2: LLM enrichment at push time.** The pre-push hook runs `bunx test-verifier enrich` followed by `bunx test-verifier audit verify --no-pending --no-rejected`. The enrich step walks every stub file in `pending/`, calls the LLM for each, and rewrites the file with the Summary, Analysis, and Concerns sections filled in. Front matter flips to `llm_enriched: true`. Then the verify step blocks the push if any pending or rejected files remain unresolved.

A developer who wants to review before push runs `bunx test-verifier enrich && bunx test-verifier review` manually at any time.

```
Commit  → check     → stub pending files in pending/   (fast, rules only)
        → review?   → optional, requires enrichment first
Push    → enrich    → fills in LLM analysis            (slow, LLM calls)
        → review    → human approves/rejects each
        → push gated on pending/ and rejected/ both empty
```

Why this matters: AI agents iterating on test changes can commit dozens of times in rapid succession without burning LLM calls on every iteration. The LLM cost is paid once, at the boundary where the changes leave the developer's machine.

A stub file cannot be approved. The `review` and `approve` commands refuse files where `llm_enriched: false`, prompting the user to run `enrich` first.

## 4. Pipeline

```
PHASE 1 (pre-commit)
  .test-verifier/HEAD  →  current commit
        ↓
  git diff HEAD..<current-commit>  (test files only)
        ↓
  Parser → block matcher → rule engine
        ↓
  Stub markdown files in pending/   (no LLM call)
        ↓
  HEAD updated to current commit

PHASE 2 (pre-push or on-demand)
  Walk pending/ for stub files
        ↓
  For each stub:
    - Resolve related production-code changes
      (same commit + relatedProdLookback prior commits)
    - Build LLM input: structured findings + diffs + git context
    - Call LLM with structured-output schema
    - Validate JSON, retry once on malformed
    - On unreachable: leave stub, exit non-zero
        ↓
  Rewrite stub with enrichment, flip llm_enriched: true
        ↓
  audit verify --no-pending --no-rejected gates the push
```

## 5. Matcher Transition Table

Default values; data, configurable.

| from                       | to                  | severity     |
|----------------------------|---------------------|--------------|
| `toBe`                     | `toEqual`           | SUSPICIOUS   |
| `toBe`                     | `toBeDefined`       | CRITICAL     |
| `toBe`                     | `toBeTruthy`        | CRITICAL     |
| `toBe`                     | `toBeFalsy`         | CRITICAL     |
| `toEqual`                  | `toMatchObject`     | SUSPICIOUS   |
| `toEqual`                  | `toBeDefined`       | CRITICAL     |
| `toStrictEqual`            | `toEqual`           | SUSPICIOUS   |
| `toStrictEqual`            | `toMatchObject`     | CRITICAL     |
| `toHaveLength`             | `toBeDefined`       | CRITICAL     |
| `toThrow`                  | `not.toThrow`       | CRITICAL     |
| `toHaveBeenCalledTimes`    | `toHaveBeenCalled`  | SUSPICIOUS   |
| any matcher                | removed entirely    | CRITICAL     |

## 6. Tautology Detector

Static patterns flagged as CRITICAL by default:

- Both sides of an assertion are literals: `expect(true).toBe(true)`, `expect(1).toBe(1)`
- Left and right are the same identifier: `expect(x).toEqual(x)`
- Test bodies with no assertion calls
- Functions with names matching `/_test|_check|verify|validate/i` returning a constant truthy value with no other logic
- Mocks where `mockReturnValue(true)` or `mockResolvedValue({})` is the entire mock surface for a non-trivial signature

LLM-assisted check, escalated to SUSPICIOUS minimum: the model is asked whether the test as written could plausibly fail for any production change. If the answer is no, the finding is escalated. This catches less-obvious tautologies like `expect(result || true).toBe(true)`. This check happens during enrichment.

## 7. Snapshot Test Handling

| condition                                          | severity     |
|----------------------------------------------------|--------------|
| inline snapshot literal change                     | SUSPICIOUS   |
| `.snap` changed, paired test code also changed     | SUSPICIOUS   |
| `.snap` changed, no test code change               | CRITICAL     |
| `.snap` deleted entirely                           | CRITICAL     |

Size-aware truncation for large snapshots: the LLM receives at most `maxDiffSizeForLLM` bytes of snapshot diff (default 10KB), with the human reviewer pointed at the full snapshot file path. Truncation strategy is configurable: `head-tail` (first 4KB + last 4KB), `sample` (random hunks), or `summary` (structured field-level rollup).

## 8. LLM as Mandatory Gate

The model is required for any change classified SUSPICIOUS or CRITICAL by the rule engine. Without LLM analysis, a stub pending file cannot be approved.

When the LLM is unreachable at push time, enrichment fails, the pre-push hook exits non-zero, and the push is blocked. The next time the model is reachable, `enrich` resumes. Stubs persist across attempts.

Cost control: cache analyses by `hash(beforeBlock + afterBlock + relatedProdDiff + modelVersion)` in `.test-verifier/cache.sqlite` (gitignored). Same change enriched twice does not pay twice.

Determinism: `temperature: 0`, structured JSON validated against a zod schema. One retry on malformed output, then leave the stub.

### Related production code

The LLM input includes diffs from production files related to the test under analysis. Resolution:

1. **Same-commit prod changes** (always included). Production files modified in the same commit as the test change.
2. **Prior-commit prod changes** (configurable, default off). The previous N commits' changes to the same prod files. Controlled by `llm.relatedProdLookback`.

The lookback exists because test fixes sometimes legitimately come in a follow-up commit to the prod change they correspond to. A small lookback (1–3 commits) lets the model see "the prod fix landed two commits ago, the test was just updated to match" and reduces false positives in those cases.

```ts
llm: {
  relatedProdLookback: 0,   // 0 = same commit only (default)
                            // N = also include changes from previous N commits
}
```

## 9. Audit Trail: Per-Change Markdown Files

The audit trail is a folder of markdown files committed to the repo. Granularity is one markdown file per affected test file per commit.

### Folder layout

```
.test-verifier/
├── HEAD                          # last analyzed commit SHA, committed
├── keys/                         # public keys per developer, committed
│   ├── lars@example.com.pub
│   └── alice@example.com.pub
├── pending/
│   └── 2026-04-29T14-21_abc1234_auth-validate-test.md
├── approved/
│   └── 2026-04-28T09-12_111aaaa_tax-calculate-test.md
├── rejected/
│   └── 2026-04-27T16-30_333cccc_old-flow-test.md
└── archive/
    └── 2025-Q4.md
```

### File format

Stub state (after pre-commit, before enrichment):

```markdown
---
id: tv_2026-04-29T14-21_abc1234_auth-validate-test
created_at: 2026-04-29T14:21:00Z
severity: CRITICAL
status: pending
llm_enriched: false
test_file: src/lib/auth/validate.test.ts
prod_files_related:
  - src/lib/auth/validate.ts
commit: abc1234567890abcdef
parent_commit: abc0000000000000000
diff_hash: sha256:9f86d081...
generator: human
generator_signature: ed25519:...
---

# Test change in `src/lib/auth/validate.test.ts`

## Findings (rule engine)

- **CRITICAL** `it.skip` introduced on line 42 (was `it` previously)
- **CRITICAL** assertion `expect(validateExpiry(token)).toBe(false)` removed
- **SUSPICIOUS** related production deletion in `validate.ts:18-31`

## Diff

​```diff
-it('rejects expired tokens', async () => {
-  const token = createExpiredToken()
-  expect(validateExpiry(token)).toBe(false)
-})
+it.skip('rejects expired tokens', async () => {
+  const token = createExpiredToken()
+})
​```

## Analysis

(Pending LLM enrichment. Run `bunx test-verifier enrich`.)

## Decision

(Empty until enrichment is complete and a human approves or rejects.)
```

Enriched state (after `enrich`): the front matter flips `llm_enriched: true`, `llm_model: claude-sonnet-4-7` is added, and the Analysis section is filled in with summary, detail, and concerns. The Decision section is still empty until a human acts.

After approval, the Decision section is appended with a signed entry and the file moves to `approved/`.

### Approval mechanics

```
bunx test-verifier approve tv_2026-04-29T14-21_abc1234_auth-validate-test \
  --rationale "validateExpiry moved to JWT middleware, follow-up #421"
```

Appends a signed decision section, moves the file to `approved/`. The signature covers both the original analysis (pinned by the diff hash) and the decision text.

### HEAD tracking

`.test-verifier/HEAD` is a single-line file with the last analyzed commit SHA. Advanced by phase 1 (`check`) only when no findings parked. Phase 2 (`enrich`) does not touch HEAD; it operates on whatever stubs exist. Concurrent advances by two developers produce a normal one-line merge conflict; whoever rebases picks the later SHA.

`bunx test-verifier init` writes the current commit SHA to bootstrap a clean slate. First commit after init is the first one analyzed.

### Compaction

```
bunx test-verifier audit compact --period=quarter --before=2026-01-01
```

Reads `approved/` files older than the cutoff, generates `archive/2025-Q4.md` with one-line entries per change, and (with `--delete`) removes the originals.

## 10. Per-User Signing Keys

Each developer has their own Ed25519 keypair. Public keys are committed to the repo. Private keys stay local.

```
~/.test-verifier/keys/<repo-id>.key    # private key, mode 0600, gitignored
.test-verifier/keys/<email>.pub        # public key, committed
```

`bunx test-verifier init` (run once per developer per repo):

1. If no private key exists for this repo, generate an Ed25519 keypair
2. Store the private key locally (mode 0600)
3. Write the public key into the repo
4. Prompt the user to commit it

Repo-id is a hash of the origin remote, so a developer working across multiple repos has distinct keys per repo.

When a human approves a finding, the tool reads the local private key, signs the canonical form of (front matter hash + decision section), and embeds the signature in the file.

`bunx test-verifier audit verify` walks every approved/rejected file, looks up the approver's public key in `.test-verifier/keys/<email>.pub`, and verifies the signature. CI runs this on every PR. Tampering invalidates the signature.

If a developer leaves the team, their public key just stays in the repo so historical signatures continue to verify. No tracking of active vs inactive, no rotation tooling, no revocation. The MVP keeps it simple: a folder of `.pub` files. If a stronger workflow is needed later (revocation, rotation, multi-key per user), the format is extensible.

For teams already using GPG-signed commits, `crypto.signing: 'gpg'` delegates to the user's GPG key. Ed25519 is the default because it has zero external dependencies.

## 11. Configuration

```ts
// test-verifier.config.ts
import { defineConfig } from '@yourorg/test-verifier'

export default defineConfig({
  testGlobs: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.svelte.ts'],
  excludeGlobs: ['**/node_modules/**'],

  llm: {
    model: 'claude-sonnet-4-7',
    timeoutMs: 30_000,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    relatedProdLookback: 0,             // commits to look back for prod context
  },

  // Project rule: which severities skip the human review queue.
  policy: {
    autoApprove: ['SAFE'],              // ['SAFE'] | ['SAFE', 'LOW'] | []
    requireHumanFor: ['LOW', 'SUSPICIOUS', 'CRITICAL'],
    blockPushIfPending: true,
    blockMergeIfRejected: true,
  },

  rules: {
    matcherTransitions: {
      'toBe->toEqual': 'SUSPICIOUS',
      // override or extend the default table here
    },
    tautology: {
      static: 'CRITICAL',
      llmDetected: 'SUSPICIOUS',
    },
    snapshot: {
      inline: 'SUSPICIOUS',
      pairedUpdate: 'SUSPICIOUS',
      unpairedUpdate: 'CRITICAL',
      deletion: 'CRITICAL',
      maxDiffSizeForLLM: 10_000,
      truncationStrategy: 'head-tail',
    },
    skipAnnotation: 'CRITICAL',
    todoAnnotation: 'CRITICAL',
    assertionRemoved: 'CRITICAL',
  },

  audit: {
    folder: '.test-verifier',
    compactPeriod: 'quarter',
  },

  crypto: {
    signing: 'ed25519',                 // 'ed25519' | 'gpg'
  },
})
```

## 12. Integration Layers

- **Husky pre-commit**: `bunx test-verifier check`
  Runs the rule engine. Produces stub pending files. Fast.
- **Husky pre-push**: `bunx test-verifier enrich && bunx test-verifier audit verify --no-pending --no-rejected`
  Fills in LLM analysis, then blocks the push if anything is unresolved or signatures fail.
- **CI on PRs**: `bunx test-verifier audit verify --signatures` plus the same pending/rejected check.
- **CI on release branches**: additionally blocks if any approved file has an unresolved peer-review section with `verdict: disputed`.
- **MCP server**: exposes `check`, `enrich`, and `list_pending` to AI agents. No `approve` or `reject`. The pending file's front matter records `generator: agent:<session-id>` so audit trails distinguish agent-produced from human-produced findings.

## 13. SvelteKit Specifics

- Vitest as the runner; understand `vi.mock`, `vi.spyOn`, `vi.fn`, conditional `skipIf` / `runIf`
- `@testing-library/svelte`: `render()`, `fireEvent`, accessibility-query assertions are first-class semantic surface
- `+server.test.ts` for API routes: status code and response body assertions matter most
- `+page.test.ts` for page logic: data-loading and form-action assertions matter
- Playwright e2e: separate adapter, same pipeline
- Snapshot tests: handled per §7

## 14. Implementation Roadmap

**MVP.** TS library, ts-morph parser, rule engine with skip/delete/matcher-table/tautology detector. Per-commit markdown writer with stub state. `.test-verifier/HEAD` tracking. Ed25519 keygen and signing. CLI: `init`, `check`, `enrich`, `review`, `approve`, `reject`. Husky-compatible.

**v0.1.** Snapshot test handling per §7. `audit verify` for signatures. `audit compact`. `relatedProdLookback` wired through.

**v0.2.** GitHub Action wrapper. Configurable matcher transition table fully wired. Peer-review section workflow.

**v0.3.** MCP server entry point exposing `check`, `enrich`, `list_pending` (no approve).

**v1.0.** Multi-developer workflow battle-tested. Cost-tracking and cache hit-rate reporting. GPG signing alternative.

**v1.x.** Mutation-aware verification (Stryker-style) for highest-confidence findings.

---

This locks in the shape. The natural first slice for prototyping is the rule engine plus the markdown writer plus Ed25519 sign/verify, all without git integration: a function that takes `(beforeFile, afterFile)` and produces a stub markdown file that can be enriched, signed, and verified. Roughly 300–400 lines of TypeScript. After that, the `enrich` step (LLM call against the structured-output schema) is another 100 lines, and git integration plus the CLI wrapper finish the MVP.
