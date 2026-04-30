# test-verifier

A git hook tool that catches weakened tests before they reach your main branch. It defends against a specific failure pattern: when test failures are "fixed" by changing the test instead of fixing the actual bug.

test-verifier detects risky patterns like:

- Tests being skipped (`.skip`, `.todo`, `.skipIf(true)`)
- Assertions being removed or weakened (`expect(x).toBe(42)` -> `expect(x).toBeDefined()`)
- Matcher transitions that reduce strictness (`toBe` -> `toEqual`)
- Tautological assertions that always pass
- Snapshot updates without proper verification
- Test deletions or silent edge case removal

## How It Works

test-verifier uses a two-phase analysis pipeline:

**Phase 1 -- Pre-Commit (fast, rules only)**
Parses test file diffs and runs a rule engine. Creates stub markdown files in `.test-verifier/pending/` with findings. No LLM calls, sub-second performance.

**Phase 2 -- Pre-Push (LLM-enriched)**
Calls an LLM (Claude or Ollama) to provide deeper context and risk assessment. Updates stub files with analysis and recommendations. Blocks push if unresolved findings remain.

```
Commit  -> check     -> stub pending files (fast, rules only)
Push    -> enrich    -> fill in LLM analysis
        -> review    -> human approves/rejects each finding
        -> verify    -> block push if pending/rejected findings exist
```

## Severity Levels

| Level | Meaning | Examples |
|---|---|---|
| SAFE | No risk | New tests, formatting, identifier renames |
| LOW | Structural only | Splitting tests, moving between `describe` blocks |
| SUSPICIOUS | Behavior changed | Expected value changes, matcher changes |
| CRITICAL | Coverage reduced | Deleted tests, skipped tests, assertion removal |

By default, only `SAFE` findings are auto-approved. Everything else requires human review.

## Prerequisites

- [Bun](https://bun.sh/) runtime
- Git repository with `user.email` configured
- `ANTHROPIC_API_KEY` environment variable (for Claude-based LLM enrichment), or a local [Ollama](https://ollama.com/) instance

## Setup

Install dependencies:

```bash
bun install
```

Initialize test-verifier in your repository:

```bash
bunx test-verifier init
```

This creates the `.test-verifier/` directory structure and generates an Ed25519 keypair for audit trail signing.

Set up git hooks (optional but recommended):

```bash
bunx test-verifier setup-hooks
```

This installs pre-commit and pre-push git hooks that run the two-phase pipeline automatically.

Set your API key if using Claude:

```bash
export ANTHROPIC_API_KEY=sk-...
```

## Configuration

Create `test-verifier.config.ts` in your repository root (optional -- sensible defaults are used):

```typescript
import { defineConfig } from "test-verifier";

export default defineConfig({
  testGlobs: ["**/*.test.ts", "**/*.spec.ts"],
  llm: {
    provider: "anthropic",       // or "ollama"
    model: "claude-sonnet-4-7",
    relatedProdLookback: 3,      // commits of production context to include
  },
  policy: {
    autoApprove: ["SAFE"],
    blockPushIfPending: true,
    blockMergeIfRejected: true,
  },
});
```

## Usage

### CLI Commands

```bash
# Phase 1: analyze test changes (rules only)
bunx test-verifier check

# Phase 2: enrich pending findings with LLM
bunx test-verifier enrich

# Interactively review pending findings
bunx test-verifier review

# Approve or reject a specific finding
bunx test-verifier approve <finding-id> --rationale "reason"
bunx test-verifier reject <finding-id> --rationale "reason"

# Verify audit trail (used by pre-push hook)
bunx test-verifier audit verify

# Compact old approved findings into archives
bunx test-verifier audit compact --before=2025-01-01

# Set up git hooks
bunx test-verifier setup-hooks
```

### With Git Hooks

Once hooks are installed, the workflow is automatic:

1. **Commit** -- pre-commit hook runs `check`, creates pending stubs (does not block commit)
2. **Push** -- pre-push hook runs `enrich` then `verify`, blocks push if unresolved findings remain
3. **Review** -- run `bunx test-verifier review` to approve or reject findings before pushing

### npm Scripts

```bash
bun run dev          # Run CLI
bun run check        # Run check command
bun run typecheck    # TypeScript type checking
```

## Running Tests

```bash
bun test
```

## Project Structure

```
src/
  cli.ts                 # CLI entry point
  config.ts              # Configuration schema and loader
  rule-engine.ts         # Core verification logic
  diff-parser.ts         # Unified diff parser
  test-block-extractor.ts # AST-based test block extraction
  commands/              # CLI command implementations
  rules/                 # Individual detection rules
  llm/                   # LLM client (Anthropic, Ollama)
  crypto/                # Ed25519 signing for audit trail
  commands/setup-hooks.ts # Git hook installer

.test-verifier/          # Audit directory (created by init)
  pending/               # Findings awaiting review
  approved/              # Approved findings
  rejected/              # Rejected findings
  archive/               # Archived old findings
  keys/                  # Ed25519 keypairs
  cache.sqlite           # LLM response cache
```

## Developer Notes

### Installing the dev version globally

To use your in-progress version of `test-verifier` as a command in any other project, create a global symlink with npm:

```bash
npm link        # from the test-verifier project root
```

This puts a `test-verifier` symlink in your global npm bin directory (see `npm prefix -g`/bin), which is normally on `PATH`. Because it's a symlink to your working tree, edits to `src/cli.ts` and friends are picked up immediately -- no reinstall needed.

Verify the link points at your working tree:

```bash
which test-verifier   # should resolve to a symlink under `npm prefix -g`/bin
```

> **Important:** call the binary directly (`test-verifier setup-hooks`), **not** `bunx test-verifier ...`. `bunx` ignores `npm link` and downloads `test-verifier@latest` from the npm registry into a temp dir, so you'd be running the published version, not your local checkout. (Symptom: errors with paths like `/private/var/folders/.../bunx-*-test-verifier@latest/...`.)

To remove the global link later:

```bash
npm unlink -g test-verifier
```

> Note: `bun link` (run from this project) followed by `bun link test-verifier` (run in a consumer project) wires the package into that project's `node_modules`, but does **not** add the bin to your shell `PATH`. Use `npm link` if you want the command available globally.

## License

ISC
