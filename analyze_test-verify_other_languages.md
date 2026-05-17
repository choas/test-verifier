# Concept: Multi-Language Support for Test-Verifier

An analysis of how easy or complicated it would be to extend test-verifier beyond TypeScript/JavaScript to support other programming languages and their test frameworks.

## 1. Current State

Test-verifier is built exclusively for TypeScript/JavaScript using:

- **ts-morph** for AST parsing (TypeScript compiler API wrapper)
- Hardcoded test syntax: `describe`, `it`, `test` with `.skip`, `.todo`, `.only` modifiers
- Hardcoded matcher recognition: `toBe`, `toEqual`, `toBeDefined`, `toHaveLength`, etc.
- Jest/Vitest/Jasmine `expect()` API assumptions throughout

There is no abstraction layer between "parse test file" and "apply rules." The rule engine directly consumes ts-morph AST nodes.

## 2. What Is Already Language-Agnostic

These components would work unchanged for any language:

| Component | Why |
|-----------|-----|
| Git diff detection (`diff-parser.ts`, `git.ts`) | Operates on unified diff format, no language knowledge |
| Audit trail (markdown stubs, signatures, SQLite) | Pure metadata; language-irrelevant |
| LLM enrichment pipeline | Sends text to Claude/Ollama; already language-neutral |
| CLI, config loading, review workflow | Orchestration only |
| Crypto (Ed25519 signing) | Language-irrelevant |

Roughly **40-50%** of the codebase is reusable as-is.

## 3. What Must Be Built Per Language

### 3.1 Test File Detection

**Effort: Low**

Each language needs glob patterns for test file discovery. This is already configurable via `testGlobs` in config. Examples:

| Language | Patterns |
|----------|----------|
| Python | `**/test_*.py`, `**/*_test.py`, `**/tests/*.py` |
| Go | `**/*_test.go` |
| Rust | `**/tests/*.rs`, inline `#[cfg(test)]` modules |
| Java | `**/src/test/**/*.java`, `**/*Test.java` |
| Ruby | `**/*_spec.rb`, `**/test_*.rb` |
| C# | `**/*Tests.cs`, `**/*.Test.cs` |

### 3.2 Test Block Extraction (AST Parsing)

**Effort: High — this is the core challenge**

Each language requires a parser that produces `TestBlock[]` structures. Options:

| Language | Parser Options | Complexity |
|----------|---------------|------------|
| Python | tree-sitter-python (WASM), or shell out to Python AST | Medium |
| Go | tree-sitter-go, or shell out to `go/ast` | Medium |
| Rust | tree-sitter-rust | Medium-High (macros) |
| Java | tree-sitter-java | Medium |
| Ruby | tree-sitter-ruby | Medium |
| C# | tree-sitter-c-sharp | Medium |

**tree-sitter** is the most practical approach: it has WASM bindings for Node/Bun, supports 100+ languages, and provides a uniform query API. A single tree-sitter integration replaces the need for per-language native parsers.

### 3.3 Test Framework Semantics

**Effort: Medium-High per framework**

Each test framework has its own idioms for skipping, assertions, and structure:

#### Python (pytest)
```python
# Skip
@pytest.mark.skip(reason="...")
@pytest.mark.skipIf(condition, reason="...")
pytest.skip("reason")

# Assertions (plain assert, no matchers)
assert result == 42
assert len(items) == 3
assert result is not None

# Weakening patterns
assert result == 42  →  assert result is not None
assert x == expected →  assert isinstance(x, int)
```

#### Go (testing)
```go
// Skip
t.Skip("reason")
t.SkipNow()

// Assertions (no built-in matchers; manual if-checks or testify)
if got != want { t.Errorf("got %v, want %v", got, want) }
assert.Equal(t, expected, actual)  // testify

// Weakening patterns
assert.Equal(t, 42, result) → assert.NotNil(t, result)
t.Errorf(...)               → // deleted
```

#### Rust (#[test] + assert macros)
```rust
// Skip
#[ignore]
#[cfg(not(...))]

// Assertions
assert_eq!(result, 42);
assert!(condition);
assert_ne!(a, b);

// Weakening
assert_eq!(result, 42) → assert!(result > 0)
```

#### Java (JUnit)
```java
// Skip
@Disabled("reason")
@EnabledIf(...)
Assumptions.assumeTrue(condition);

// Assertions
assertEquals(42, result);
assertNotNull(result);
assertTrue(condition);

// Weakening
assertEquals(42, result) → assertNotNull(result)
```

### 3.4 Matcher Transition Tables

**Effort: Medium per framework**

The current matcher strictness bands (EXACT > STRUCTURAL > EXISTENCE > TRUTHINESS) map differently per framework:

| Band | Jest/Vitest | pytest | Go testify | JUnit |
|------|-------------|--------|------------|-------|
| EXACT | `toBe` | `== value` | `Equal` | `assertEquals` |
| STRUCTURAL | `toEqual` | `== structure` | `EqualValues` | `assertEquals` (deep) |
| EXISTENCE | `toBeDefined` | `is not None` | `NotNil` | `assertNotNull` |
| TRUTHINESS | `toBeTruthy` | `assert x` | `True` | `assertTrue` |

### 3.5 Rule Engine Adaptation

**Effort: Medium**

Current rules operate on `TestBlock` and `Assertion` types. If these types become language-agnostic (which they mostly already are), rules need minimal changes:

- **skip-detector**: Must know each framework's skip idioms (decorators, method calls, attributes)
- **assertion-removal**: Works on count changes — mostly language-agnostic already
- **matcher-transitions**: Needs per-framework transition tables
- **tautology-detector**: Must recognize language-specific tautologies (`assert True`, `if true { }`)
- **safe-classifier**: Needs language-specific formatting/refactor patterns
- **value-change-detector**: Mostly language-agnostic (operates on literal values)

## 4. Integration Strategies

### Strategy A: tree-sitter Unified Parser (Recommended)

**Architecture:**
```
diff-parser (unchanged)
    ↓
language-detector (new, trivial: file extension)
    ↓
tree-sitter parser (new, one integration, many grammars)
    ↓
framework-adapter (new, per-framework: maps AST → TestBlock[])
    ↓
rule-engine (minor changes: consumes TestBlock[] as before)
```

**Pros:**
- Single parser infrastructure for all languages
- tree-sitter has mature WASM bindings (`web-tree-sitter`)
- Grammars maintained by community
- Query language (S-expressions) allows pattern matching

**Cons:**
- tree-sitter queries are less precise than ts-morph for TypeScript
- Framework-specific semantics still need manual mapping
- WASM overhead (acceptable for a git hook)

**Effort estimate:** 2-3 weeks for infrastructure + 1 week per additional language/framework

### Strategy B: Shell-out to Native Parsers

**Architecture:**
```
diff-parser (unchanged)
    ↓
language-specific subprocess (python3 -c "...", go vet, etc.)
    ↓
JSON output (standardized TestBlock[] schema)
    ↓
rule-engine (unchanged)
```

**Pros:**
- Most accurate parsing per language (native AST)
- Each language helper is independent and testable

**Cons:**
- Requires each language's toolchain installed
- Subprocess overhead per file
- Maintenance burden: N separate parsers in N languages
- Dependency hell for users

**Effort estimate:** 1-2 weeks per language (but ongoing maintenance cost is high)

### Strategy C: LLM-First Detection (Lightweight)

**Architecture:**
```
diff-parser (unchanged)
    ↓
file extension → framework heuristic
    ↓
LLM prompt: "Extract test blocks and assertions from this diff"
    ↓
structured output → TestBlock[]
    ↓
rule-engine (unchanged)
```

**Pros:**
- Zero parser infrastructure
- Handles any language immediately
- Understands framework semantics implicitly

**Cons:**
- Slow for pre-commit (API latency)
- Non-deterministic
- Cost per invocation
- Can't run offline without local LLM
- Defeats the "fast Phase 1" design principle

**Best as:** A fallback for unsupported languages, not the primary strategy.

### Strategy D: Regex/Heuristic (Quick & Dirty)

Skip AST parsing entirely; use regex patterns on the diff to detect:
- Lines matching `skip|ignore|disabled|pending` near test definitions
- Removed lines containing `assert|expect|should`
- Added lines with obvious tautologies

**Pros:**
- Trivial to add new languages (just patterns)
- No dependencies
- Fast

**Cons:**
- High false-positive rate
- Misses structural changes (moved tests, renamed blocks)
- Cannot track assertion counts reliably
- Cannot detect matcher transitions

**Best as:** A "better than nothing" mode for unknown languages.

## 5. Recommended Approach: Hybrid

| Phase | Strategy | Languages |
|-------|----------|-----------|
| Keep | ts-morph (current) | TypeScript/JavaScript |
| Add | tree-sitter | Python, Go, Rust, Java |
| Fallback | Regex heuristics | Any unrecognized language |
| Optional | LLM extraction | Complex/exotic frameworks |

This preserves the current high-fidelity TypeScript support while adding progressively lower-fidelity support for other languages.

## 6. Effort Estimates

| Task | Effort | Priority |
|------|--------|----------|
| Abstract `TestBlock` extraction into interface | 2-3 days | Required first |
| tree-sitter WASM integration | 3-5 days | Foundation |
| Python/pytest adapter | 3-5 days | High (most requested) |
| Go/testing adapter | 3-5 days | Medium |
| Rust adapter | 5-7 days | Medium (macro complexity) |
| Java/JUnit adapter | 3-5 days | Medium |
| Ruby/RSpec adapter | 3-5 days | Lower |
| Per-language matcher transition tables | 1-2 days each | Per language |
| Regex fallback for unknown languages | 2-3 days | Nice-to-have |
| Config schema extension for multi-language | 1 day | Required |

**Total for Python + Go + infrastructure: ~3-4 weeks**
**Total for full multi-language (6 languages): ~8-12 weeks**

## 7. Key Challenges

### 7.1 Assertion Styles Vary Radically

- **Matcher-based** (Jest, testify): `expect(x).toBe(y)`, `assert.Equal(t, x, y)`
- **Plain assert** (Python, Rust): `assert x == y`, `assert_eq!(x, y)`
- **No assertions** (Go stdlib): `if got != want { t.Errorf(...) }`

The current model assumes matcher chains. Plain-assert languages need a different detection model: track the entire `assert` statement as the "matcher" and detect weakening via operator/function changes.

### 7.2 Inline vs File-Based Tests

- **Go, Rust**: Tests live in the same file as production code (`_test.go`, `#[cfg(test)]`)
- **Python, Java, JS**: Tests usually in separate files

The diff parser needs to distinguish "test code changed" from "production code in same file changed" for inline-test languages.

### 7.3 Macro/Decorator Complexity

- **Rust**: `#[tokio::test]`, `#[rstest]`, procedural macros generating tests
- **Python**: `@pytest.fixture`, `@pytest.mark.parametrize`
- **Java**: `@ParameterizedTest`, `@MethodSource`

These expand or transform test definitions in ways that are invisible to basic AST parsing. tree-sitter sees the surface syntax but not the expanded semantics.

### 7.4 Framework Detection

A single language may use multiple test frameworks. Need heuristics:
- Python: pytest vs unittest vs nose2
- Java: JUnit 4 vs JUnit 5 vs TestNG
- Ruby: RSpec vs Minitest
- Rust: built-in vs proptest vs rstest

Import/use statements or config files can disambiguate.

## 8. Conclusion

Adding other languages is **feasible but non-trivial**. The main complexity lies not in parsing (tree-sitter solves that generically) but in **understanding each framework's semantics** — what constitutes a skip, an assertion, a weakening.

The recommended path:

1. Refactor `test-block-extractor.ts` into a `LanguageAdapter` interface
2. Integrate tree-sitter as the multi-language parser backend
3. Add Python/pytest first (most common AI-assisted language alongside TS)
4. Add Go second (simple test framework, good tree-sitter grammar)
5. Use regex fallback for "better than nothing" coverage of other languages
6. Keep ts-morph for TypeScript (highest fidelity, already working)

The architecture change from "hardcoded TypeScript" to "pluggable language adapters" is a **one-time refactor of ~2-3 days** that unlocks incremental language additions at ~1 week each.
