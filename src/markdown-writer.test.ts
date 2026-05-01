import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import {
  generateStubMarkdown,
  formatTimestamp,
  sanitizeTestFilePath,
} from "./markdown-writer";
import { Severity, type Finding } from "./types";
import type { RuleEngineResult } from "./rule-engine";

const COMMIT = "abc1234567890abcdef1234567890abcdef123456";
const PARENT = "000aaa1111bbb2222ccc3333ddd4444eee5555fff";
const FIXED_DATE = new Date("2026-04-29T14:21:00Z");

function makeResult(overrides?: Partial<RuleEngineResult>): RuleEngineResult {
  return {
    filePath: "src/lib/auth/validate.test.ts",
    findings: [],
    overallSeverity: Severity.SAFE,
    ...overrides,
  };
}

function makeFinding(overrides?: Partial<Finding>): Finding {
  return {
    rule: "skip-detector",
    severity: Severity.CRITICAL,
    line: 42,
    message: "`it.skip` introduced on line 42 (was `it` previously)",
    before: "it(",
    after: "it.skip(",
    ...overrides,
  };
}

const RAW_DIFF = `-it('rejects expired tokens', async () => {
-  const token = createExpiredToken()
-  expect(validateExpiry(token)).toBe(false)
-})
+it.skip('rejects expired tokens', async () => {
+  const token = createExpiredToken()
+})`;

describe("formatTimestamp", () => {
  it("formats a date as YYYY-MM-DDTHH-mm in UTC", () => {
    expect(formatTimestamp(new Date("2026-04-29T14:21:00Z"))).toBe("2026-04-29T14-21");
  });

  it("zero-pads single-digit months and days", () => {
    expect(formatTimestamp(new Date("2026-01-05T03:07:00Z"))).toBe("2026-01-05T03-07");
  });

  it("uses UTC regardless of local timezone", () => {
    const ts = formatTimestamp(new Date("2026-12-31T23:59:00Z"));
    expect(ts).toBe("2026-12-31T23-59");
  });
});

describe("sanitizeTestFilePath", () => {
  it("strips .test.ts and replaces separators", () => {
    expect(sanitizeTestFilePath("src/lib/auth/validate.test.ts")).toBe(
      "src-lib-auth-validate-test",
    );
  });

  it("strips .spec.ts extension", () => {
    expect(sanitizeTestFilePath("utils.spec.ts")).toBe("utils-test");
  });

  it("strips .test.tsx extension", () => {
    expect(sanitizeTestFilePath("components/Button.test.tsx")).toBe("components-Button-test");
  });

  it("strips .test.svelte.ts extension", () => {
    expect(sanitizeTestFilePath("lib/Widget.test.svelte.ts")).toBe("lib-Widget-test");
  });

  it("handles Windows-style backslashes", () => {
    expect(sanitizeTestFilePath("src\\lib\\auth\\validate.test.ts")).toBe(
      "src-lib-auth-validate-test",
    );
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeTestFilePath("src//nested///deep.test.ts")).toBe("src-nested-deep-test");
  });

  it("does not double-append -test if already present", () => {
    expect(sanitizeTestFilePath("my-test.test.ts")).toBe("my-test");
  });
});

describe("generateStubMarkdown", () => {
  it("generates correct filename format", () => {
    const { filename } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      createdAt: FIXED_DATE,
    });

    expect(filename).toBe("2026-04-29T14-21_abc1234_src-lib-auth-validate-test.md");
  });

  it("generates correct id in front matter", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      createdAt: FIXED_DATE,
    });

    expect(stub.id).toBe("tv_2026-04-29T14-21_abc1234_src-lib-auth-validate-test");
  });

  it("sets created_at as ISO string without milliseconds", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      createdAt: new Date("2026-04-29T14:21:33.456Z"),
    });

    expect(stub.created_at).toBe("2026-04-29T14:21:33Z");
  });

  it("sets status to pending and llm_enriched to false", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(stub.status).toBe("pending");
    expect(stub.llm_enriched).toBe(false);
  });

  it("uses overall severity from rule engine result", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult({ overallSeverity: Severity.CRITICAL }),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(stub.severity).toBe(Severity.CRITICAL);
  });

  it("computes sha256 diff hash", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    const expected = createHash("sha256").update(RAW_DIFF).digest("hex");
    expect(stub.diff_hash).toBe(`sha256:${expected}`);
  });

  it("includes commit and parent_commit", () => {
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(stub.commit).toBe(COMMIT);
    expect(stub.parent_commit).toBe(PARENT);
  });

  it("includes prod_files_related when provided", () => {
    const { stub, content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      prodFilesRelated: ["src/lib/auth/validate.ts", "src/lib/auth/types.ts"],
    });

    expect(stub.prod_files_related).toEqual([
      "src/lib/auth/validate.ts",
      "src/lib/auth/types.ts",
    ]);
    expect(content).toContain("prod_files_related:");
    expect(content).toContain('  - "src/lib/auth/validate.ts"');
    expect(content).toContain('  - "src/lib/auth/types.ts"');
  });

  it("renders empty prod_files_related as empty array", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("prod_files_related: []");
  });

  it("renders front matter block with correct delimiters", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult({ overallSeverity: Severity.CRITICAL }),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      createdAt: FIXED_DATE,
    });

    expect(content).toStartWith("---\n");
    expect(content).toContain("\n---\n");
    expect(content).toContain("severity: CRITICAL");
    expect(content).toContain("status: pending");
    expect(content).toContain("llm_enriched: false");
    expect(content).toContain('test_file: "src/lib/auth/validate.test.ts"');
  });

  it("renders title with test file path", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("# Test change in `src/lib/auth/validate.test.ts`");
  });

  it("renders findings section with severity and message", () => {
    const findings: Finding[] = [
      makeFinding({
        severity: Severity.CRITICAL,
        message: "`it.skip` introduced on line 42",
      }),
      makeFinding({
        rule: "assertion-removal",
        severity: Severity.SUSPICIOUS,
        message: "assertion removed in test block",
      }),
    ];

    const { content } = generateStubMarkdown({
      ruleResult: makeResult({ findings, overallSeverity: Severity.CRITICAL }),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("## Findings (rule engine)");
    expect(content).toContain("- **CRITICAL** `it.skip` introduced on line 42");
    expect(content).toContain("- **SUSPICIOUS** assertion removed in test block");
  });

  it("renders 'No findings.' when findings array is empty", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult({ findings: [] }),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("No findings.");
  });

  it("renders diff section with raw diff in code block", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("## Diff");
    expect(content).toContain("```diff");
    expect(content).toContain(RAW_DIFF);
    expect(content).toContain("```");
  });

  it("renders placeholder Analysis section", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("## Analysis");
    expect(content).toContain(
      "(Pending LLM enrichment. Run `bunx test-verifier enrich`.)",
    );
  });

  it("renders placeholder Decision section", () => {
    const { content } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });

    expect(content).toContain("## Decision");
    expect(content).toContain(
      "(Empty until enrichment is complete and a human approves or rejects.)",
    );
  });

  it("produces full markdown matching the spec format", () => {
    const findings: Finding[] = [
      makeFinding({
        severity: Severity.CRITICAL,
        message: "`it.skip` introduced on line 42 (was `it` previously)",
      }),
      makeFinding({
        rule: "assertion-removal",
        severity: Severity.CRITICAL,
        message: "assertion `expect(validateExpiry(token)).toBe(false)` removed",
      }),
      makeFinding({
        rule: "prod-deletion",
        severity: Severity.SUSPICIOUS,
        message: "related production deletion in `validate.ts:18-31`",
      }),
    ];

    const { content, filename, stub } = generateStubMarkdown({
      ruleResult: makeResult({
        findings,
        overallSeverity: Severity.CRITICAL,
      }),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      prodFilesRelated: ["src/lib/auth/validate.ts"],
      createdAt: FIXED_DATE,
    });

    expect(filename).toMatch(/^2026-04-29T14-21_abc1234_.+\.md$/);
    expect(stub.id).toStartWith("tv_");
    expect(stub.severity).toBe(Severity.CRITICAL);
    expect(stub.status).toBe("pending");
    expect(stub.llm_enriched).toBe(false);

    const sections = content.split("\n## ");
    expect(sections.length).toBe(5);
  });

  it("defaults createdAt to current time when not provided", () => {
    const before = new Date();
    const { stub } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: COMMIT,
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
    });
    const after = new Date();

    const createdAt = new Date(stub.created_at);
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it("uses first 7 characters of commit as short SHA", () => {
    const { filename } = generateStubMarkdown({
      ruleResult: makeResult(),
      commit: "fedcba9876543210fedcba9876543210fedcba98",
      parentCommit: PARENT,
      rawDiff: RAW_DIFF,
      createdAt: FIXED_DATE,
    });

    expect(filename).toContain("_fedcba9_");
  });
});
