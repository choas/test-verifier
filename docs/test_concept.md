# Test Concept

This document describes the test domains of **test-verifier** and their scenarios, classified by complexity.

---

## 1. Diff Parsing

Parses unified diff format into structured hunks with added, removed, and context lines.

### Basic

- Parse a single-hunk diff with added and removed lines
- Parse a diff with only additions
- Parse a diff with only deletions
- Extract correct file paths from diff headers
- Parse line numbers from hunk headers

### Advanced

- Parse multi-hunk diffs within a single file
- Parse diffs spanning multiple files
- Handle diffs with context lines surrounding changes
- Parse renamed file diffs

### Edge Cases

- Empty diff input
- Diff with no actual changes (context only)
- Diff with binary file markers
- Malformed hunk headers
- Files with no newline at end of file marker

---

## 2. Test Block Extraction (AST)

Uses `ts-morph` to parse test files and extract describe/it/test blocks, assertions, and skip states.

### Basic

- Extract a single `it` block with one assertion
- Extract a `describe` block with nested `it` blocks
- Detect `.skip` and `.todo` modifiers on test blocks
- Identify common matchers (`toBe`, `toEqual`, `toBeTruthy`)

### Advanced

- Extract deeply nested `describe` > `describe` > `it` structures
- Handle `test.each` / `it.each` parameterized tests
- Extract multiple assertions within a single test
- Detect matcher arguments (expected values)
- Handle arrow functions and regular function expressions

### Edge Cases

- Test file with no test blocks
- Test block with empty body (no assertions)
- Dynamic test names using template literals
- Tests using aliased imports (`import { it as spec }`)
- Concurrent test modifiers (`.concurrent`)

---

## 3. Rule Engine

Orchestrates all detection rules and aggregates findings with severity levels.

### Basic

- Run all rules against a diff and return combined findings
- Assign correct severity to each finding type
- Return empty findings for a clean diff
- Auto-approve SAFE findings

### Advanced

- Combine multiple findings from different rules in a single diff
- Prioritize highest severity when multiple rules trigger on the same hunk
- Process diffs with mixed test and non-test files (ignore non-test)

### Edge Cases

- Diff that triggers every rule simultaneously
- Very large diff with hundreds of hunks
- Diff where one rule flags CRITICAL and another flags SAFE on the same block

---

## 4. Skip Detector

Detects added `.skip`, `.todo`, and `.skipIf()` annotations on test blocks.

### Basic

- Detect `it.skip` added to a test
- Detect `describe.skip` added to a suite
- Detect `test.todo` added
- Ignore removed `.skip` (re-enabling a test)

### Advanced

- Detect `.skipIf(condition)` with dynamic conditions
- Detect skip added inside a nested describe
- Distinguish skip on a single test vs. an entire suite

### Edge Cases

- `.skip` appearing in a comment, not actual code
- `.skip` in a string literal (test name containing "skip")
- Removing `.skip` from one test while adding it to another in the same diff

---

## 5. Assertion Removal

Identifies deleted tests and removed `expect` assertions, distinguishing deletions from moves.

### Basic

- Detect a deleted `expect(...).toBe(...)` line
- Detect an entire test block removed
- Count the number of removed assertions per test

### Advanced

- Distinguish a moved assertion (present in both added and removed) from a truly deleted one
- Detect removed assertions when the test block itself is restructured
- Handle removal of multiple assertions across different test blocks

### Edge Cases

- Assertion removed from one test but an identical one added to another
- Commented-out assertions (not deleted, but effectively removed)
- Replacing multiple specific assertions with a single broad assertion

---

## 6. Matcher Transitions

Tracks changes between Jest/Vitest matchers (e.g., `toBe` to `toEqual`, strict to loose).

### Basic

- Detect `toBe` changed to `toEqual` (strict to loose)
- Detect `toStrictEqual` changed to `toEqual`
- Detect `toThrow` changed to `not.toThrow`

### Advanced

- Detect `toBe(value)` changed to `toBeDefined()` (specific to vague)
- Detect `toEqual(expected)` changed to `toBeTruthy()` (value check to existence check)
- Track multiple matcher transitions across a single test file

### Edge Cases

- Matcher change paired with a legitimate expected-value update
- Transition between custom matchers
- Negation added (`not.toBe`) vs. matcher swap
- Same matcher kept but arguments significantly changed

---

## 7. Tautology Detector

Identifies always-passing assertions such as literal self-matches, same-identifier comparisons, empty tests, and truthy mock returns.

### Basic

- Detect `expect(true).toBe(true)` (literal tautology)
- Detect `expect(x).toBe(x)` (same identifier)
- Detect a test with no `expect` calls at all

### Advanced

- Detect `expect(jest.fn()).toBeTruthy()` (truthy mock return)
- Detect `expect("hello").toBe("hello")` (string literal match)
- Detect tautology introduced by a diff (not pre-existing)

### Edge Cases

- `expect(a.b).toBe(a.b)` (nested member expression tautology)
- Tautology hidden behind a variable assignment (`const x = 1; expect(x).toBe(1)`)
- Intentional identity checks in snapshot-like patterns

---

## 8. Value Change Detector

Detects when expected values in assertions change while the test subject (the thing being tested) remains the same.

### Basic

- Detect `expect(result).toBe(5)` changed to `expect(result).toBe(10)`
- Detect expected string value changed
- Detect expected array/object value changed

### Advanced

- Detect value change when the assertion is restructured but subject unchanged
- Handle value changes across multiple assertions in the same test
- Distinguish value change from a complete test rewrite

### Edge Cases

- Both subject and expected value changed (legitimate update)
- Expected value changed from a literal to a variable reference
- Floating-point precision changes (e.g., `0.1 + 0.2` adjustments)

---

## 9. Snapshot Handler

Manages snapshot file changes including inline snapshots, paired updates, and deletions.

### Basic

- Detect a deleted `.snap` file
- Detect updated inline snapshot (`.toMatchInlineSnapshot()`)
- Detect updated external snapshot file

### Advanced

- Detect snapshot update paired with a corresponding test change
- Detect unpaired snapshot deletion (snapshot removed without test removal)
- Handle bulk snapshot updates (`--updateSnapshot` runs)

### Edge Cases

- Snapshot file modified but no corresponding test file in the diff
- Partial snapshot deletion (some snapshots removed, others kept)
- Snapshot content changed to an empty string

---

## 10. Safe Classifier

Filters out legitimate, non-risky changes to reduce noise.

### Basic

- Classify formatting-only changes (whitespace, semicolons) as SAFE
- Classify type annotation additions as SAFE
- Classify new test additions (no existing test modified) as SAFE

### Advanced

- Classify identifier renames that preserve behavior as SAFE
- Distinguish a formatting change from a logic change in the same line
- Handle mixed diffs where some hunks are safe and others are not

### Edge Cases

- Rename that accidentally changes behavior (e.g., variable shadowing)
- Formatting tool output that also fixes a subtle logic issue
- Adding a type annotation that changes runtime behavior (decorators)

---

## 11. Configuration

Zod-validated config for test globs, LLM settings, policy rules, and severity levels.

### Basic

- Load default configuration when no config file exists
- Parse a valid `.test-verifier.json` config file
- Override default test globs with custom patterns

### Advanced

- Merge partial config with defaults (only override specified fields)
- Validate LLM provider setting (`anthropic` or `ollama`)
- Configure per-rule severity overrides

### Edge Cases

- Invalid config file (malformed JSON)
- Unknown fields in config (should be ignored or rejected)
- Config with contradictory policy rules (auto-approve + block on same severity)

---

## 12. Cryptographic Signing & Verification

Ed25519 keypair management, finding signatures, and tamper-proof audit verification.

### Basic

- Generate a new Ed25519 keypair
- Sign a finding decision and produce a valid signature
- Verify a valid signature returns true

### Advanced

- Verify signature against tampered content returns false
- Handle multiple keypairs across different repositories
- Canonical format consistency (diff_hash + decision)

### Edge Cases

- Missing or corrupted key file
- Signature verification with wrong public key
- Empty decision text
- Key file with incorrect permissions

---

## 13. Markdown Reader/Writer

Reads and writes finding files with YAML front matter, diff sections, and analysis content.

### Basic

- Write a finding with front matter (id, severity, status, commit)
- Read back a written finding and verify all fields
- Parse the diff section from a finding file

### Advanced

- Round-trip a finding through write then read without data loss
- Handle findings with LLM analysis sections
- Handle findings with decision and signature sections

### Edge Cases

- Finding file with missing front matter fields
- Front matter containing special YAML characters
- Very large diff sections embedded in markdown

---

## 14. Audit Folder Operations

Manages the `.test-verifier/` directory structure for pending, approved, rejected, needs_fix, resolved, and archived findings.

### Basic

- Create the audit folder structure on init
- Move a finding from `pending/` to `approved/`
- Move a finding from `pending/` to `rejected/`
- Move a finding from `pending/` to `needs_fix/`

### Advanced

- Move a finding from `needs_fix/` to `resolved/` (auto-resolution)
- Move a finding from `needs_fix/` to `approved/` (manual approval)
- Archive old approved findings during compaction
- List all pending findings for review
- Verify audit trail integrity across all folders
- Generic `moveFile` supports arbitrary status transitions

### Edge Cases

- Audit folder missing or partially deleted
- Concurrent writes to the same finding file
- Finding file with an unknown status value
- Approving a finding that is in `needs_fix` rather than `pending`

---

## 15. Git Integration

Resolves commits, extracts diffs, and finds related production files for context.

### Basic

- Get diff between two commits
- Resolve HEAD to a commit SHA
- Detect test file changes in a commit

### Advanced

- Find related production files for a changed test file (lookback analysis)
- Extract historical diffs for LLM context building
- Handle merge commits with multiple parents

### Edge Cases

- Repository with no commits
- Detached HEAD state
- Diff against an empty tree (initial commit)
- File paths with spaces or special characters

---

## 16. LLM Integration

Anthropic and Ollama clients for enriching findings with AI-powered analysis.

### Basic

- Send a prompt to the Anthropic API and receive a response
- Send a prompt to the Ollama API and receive a response
- Build a prompt with test diff context

### Advanced

- Include related production code diffs in the prompt
- Cache LLM responses to avoid redundant calls
- Handle configurable model selection and timeouts

### Edge Cases

- API timeout or network failure
- Cache hit with stale data
- Empty or malformed API response
- Rate limiting from the API provider

---

## 17. Commands (CLI)

User-facing commands: init, check, enrich, review, approve, reject, needs-fix, list, history, commit, sync, audit verify, audit compact, setup-hooks.

### Basic

- `init` creates audit directory structure and keypair
- `check` runs rules and produces pending findings; auto-resolves `needs_fix` findings when original rules no longer trigger
- `approve` signs and moves a finding to approved (accepts both `pending` and `needs_fix` findings)
- `needs-fix` marks a pending finding as needing a fix (supports `--all` for batch marking)

### Advanced

- `enrich` calls LLM and updates pending findings with analysis
- `review` displays paginated, color-coded findings interactively
- `list` shows findings filtered by status (`--status pending|needs_fix|rejected|approved|resolved`) or all (`--all`)
- `history` shows verification history for a test file (supports `--function` filter)
- `commit` commits `.test-verifier/` changes with a descriptive message
- `sync` rebuilds local database from `.test-verifier/` markdown files
- `setup-hooks` installs pre-commit and pre-push hooks via Husky
- `audit verify` validates all signatures in the audit trail
- `audit compact` archives old findings

### Edge Cases

- Running `check` with no staged test changes
- Running `approve` on an already-approved finding
- Running `approve` on a `needs_fix` finding (should move from `needs_fix/` to `approved/`)
- Running `needs-fix` with both `--all` and a specific finding ID (mutually exclusive)
- Running `enrich` when LLM provider is unavailable
- Running `audit verify` with a corrupted finding file
- `findFileByStatus` searching across multiple status directories to locate a finding

---

## 18. Caching (SQLite)

SHA256-keyed LLM response cache to reduce redundant API calls.

### Basic

- Store an LLM response in the cache
- Retrieve a cached response by key
- Generate consistent cache keys from (testDiff + prodDiff + model)

### Advanced

- Cache miss triggers a new LLM call and stores the result
- Handle cache across multiple enrichment runs

### Edge Cases

- Corrupted or locked SQLite database file
- Cache key collision (extremely unlikely with SHA256)
- Database file deleted between check and enrich runs
