import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { generateStubMarkdown } from "./markdown-writer";
import { parseMarkdown, type ParsedMarkdown } from "./markdown-reader";
import { Severity, type Finding } from "./types";
import type { RuleEngineResult } from "./rule-engine";

const COMMIT = "abc1234567890abcdef1234567890abcdef123456";
const PARENT = "000aaa1111bbb2222ccc3333ddd4444eee5555fff";
const FIXED_DATE = new Date("2026-04-29T14:21:00Z");

const RAW_DIFF = `-it('rejects expired tokens', async () => {
-  const token = createExpiredToken()
-  expect(validateExpiry(token)).toBe(false)
-})
+it.skip('rejects expired tokens', async () => {
+  const token = createExpiredToken()
+})`;

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
    message: "`it.skip` introduced on line 42",
    before: "it(",
    after: "it.skip(",
    ...overrides,
  };
}

function roundtrip(
  ruleResult: RuleEngineResult,
  opts?: { rawDiff?: string; prodFilesRelated?: string[]; createdAt?: Date },
): ParsedMarkdown {
  const { content } = generateStubMarkdown({
    ruleResult,
    commit: COMMIT,
    parentCommit: PARENT,
    rawDiff: opts?.rawDiff ?? RAW_DIFF,
    prodFilesRelated: opts?.prodFilesRelated,
    createdAt: opts?.createdAt ?? FIXED_DATE,
  });
  return parseMarkdown(content);
}

describe("parseMarkdown", () => {
  describe("front matter roundtrip", () => {
    it("preserves id", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.id).toBe("tv_2026-04-29T14-21_abc1234_src-lib-auth-validate-test");
    });

    it("preserves created_at", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.created_at).toBe("2026-04-29T14:21:00Z");
    });

    it("preserves severity", () => {
      const parsed = roundtrip(makeResult({ overallSeverity: Severity.CRITICAL }));
      expect(parsed.stub.severity).toBe(Severity.CRITICAL);
    });

    it("preserves status", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.status).toBe("pending");
    });

    it("preserves llm_enriched flag", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.llm_enriched).toBe(false);
    });

    it("preserves test_file", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.test_file).toBe("src/lib/auth/validate.test.ts");
    });

    it("preserves commit and parent_commit", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.commit).toBe(COMMIT);
      expect(parsed.stub.parent_commit).toBe(PARENT);
    });

    it("preserves diff_hash", () => {
      const parsed = roundtrip(makeResult());
      const expected = `sha256:${createHash("sha256").update(RAW_DIFF).digest("hex")}`;
      expect(parsed.stub.diff_hash).toBe(expected);
    });

    it("preserves prod_files_related as array", () => {
      const parsed = roundtrip(makeResult(), {
        prodFilesRelated: ["src/lib/auth/validate.ts", "src/lib/auth/types.ts"],
      });
      expect(parsed.stub.prod_files_related).toEqual([
        "src/lib/auth/validate.ts",
        "src/lib/auth/types.ts",
      ]);
    });

    it("preserves empty prod_files_related", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.stub.prod_files_related).toEqual([]);
    });

    it("roundtrips all severity levels", () => {
      for (const sev of [Severity.SAFE, Severity.LOW, Severity.SUSPICIOUS, Severity.CRITICAL]) {
        const parsed = roundtrip(makeResult({ overallSeverity: sev }));
        expect(parsed.stub.severity).toBe(sev);
      }
    });
  });

  describe("findings roundtrip", () => {
    it("parses findings with severity and message", () => {
      const findings = [
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

      const parsed = roundtrip(makeResult({ findings, overallSeverity: Severity.CRITICAL }));

      expect(parsed.findings).toHaveLength(2);
      expect(parsed.findings[0]).toEqual({
        severity: Severity.CRITICAL,
        message: "`it.skip` introduced on line 42",
      });
      expect(parsed.findings[1]).toEqual({
        severity: Severity.SUSPICIOUS,
        message: "assertion removed in test block",
      });
    });

    it("returns empty array when no findings", () => {
      const parsed = roundtrip(makeResult({ findings: [] }));
      expect(parsed.findings).toEqual([]);
    });

    it("handles single finding", () => {
      const findings = [makeFinding({ severity: Severity.LOW, message: "minor issue" })];
      const parsed = roundtrip(makeResult({ findings, overallSeverity: Severity.LOW }));
      expect(parsed.findings).toHaveLength(1);
      expect(parsed.findings[0].severity).toBe(Severity.LOW);
      expect(parsed.findings[0].message).toBe("minor issue");
    });
  });

  describe("diff roundtrip", () => {
    it("preserves the raw diff content", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.diff).toBe(RAW_DIFF);
    });

    it("preserves diff with special characters", () => {
      const specialDiff = `-expect(result).toBe("hello <world> & 'friends'")
+expect(result).toBe("goodbye")`;
      const parsed = roundtrip(makeResult(), { rawDiff: specialDiff });
      expect(parsed.diff).toBe(specialDiff);
    });

    it("preserves multiline diff", () => {
      const multiDiff = `-line1
-line2
-line3
+new1
+new2
+new3
+new4`;
      const parsed = roundtrip(makeResult(), { rawDiff: multiDiff });
      expect(parsed.diff).toBe(multiDiff);
    });
  });

  describe("analysis and decision sections", () => {
    it("returns pending placeholder for analysis", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.analysis).toBe("(Pending LLM enrichment. Run `bunx test-verifier enrich`.)");
    });

    it("returns pending placeholder for decision", () => {
      const parsed = roundtrip(makeResult());
      expect(parsed.decision).toBe(
        "(Empty until enrichment is complete and a human approves or rejects.)",
      );
    });
  });

  describe("enriched and approved file parsing", () => {
    it("parses an enriched file with filled analysis", () => {
      const { content } = generateStubMarkdown({
        ruleResult: makeResult({ overallSeverity: Severity.SUSPICIOUS }),
        commit: COMMIT,
        parentCommit: PARENT,
        rawDiff: RAW_DIFF,
        createdAt: FIXED_DATE,
      });

      const enriched = content
        .replace("llm_enriched: false", "llm_enriched: true")
        .replace(
          "(Pending LLM enrichment. Run `bunx test-verifier enrich`.)",
          "### Summary\n\nThe test was skipped, which weakens coverage.\n\n### Concerns\n\n- Assertion removed\n- Coverage gap",
        );

      const parsed = parseMarkdown(enriched);
      expect(parsed.stub.llm_enriched).toBe(true);
      expect(parsed.analysis).toContain("The test was skipped");
      expect(parsed.analysis).toContain("- Assertion removed");
    });

    it("parses an approved file with decision", () => {
      const { content } = generateStubMarkdown({
        ruleResult: makeResult({ overallSeverity: Severity.SUSPICIOUS }),
        commit: COMMIT,
        parentCommit: PARENT,
        rawDiff: RAW_DIFF,
        createdAt: FIXED_DATE,
      });

      const approved = content
        .replace("status: pending", "status: approved")
        .replace("llm_enriched: false", "llm_enriched: true")
        .replace(
          "(Empty until enrichment is complete and a human approves or rejects.)",
          "**Approved** by lars@example.com\n\n**Rationale:** The skip is temporary while we migrate the auth backend.\n\n**Signature:** ed25519:abc123...",
        );

      const parsed = parseMarkdown(approved);
      expect(parsed.stub.status).toBe("approved");
      expect(parsed.decision).toContain("Approved");
      expect(parsed.decision).toContain("lars@example.com");
      expect(parsed.decision).toContain("Signature:");
    });

    it("parses a rejected file", () => {
      const { content } = generateStubMarkdown({
        ruleResult: makeResult({ overallSeverity: Severity.CRITICAL }),
        commit: COMMIT,
        parentCommit: PARENT,
        rawDiff: RAW_DIFF,
        createdAt: FIXED_DATE,
      });

      const rejected = content
        .replace("status: pending", "status: rejected")
        .replace(
          "(Empty until enrichment is complete and a human approves or rejects.)",
          "**Rejected** by alice@example.com\n\n**Rationale:** This weakens the auth test suite unacceptably.",
        );

      const parsed = parseMarkdown(rejected);
      expect(parsed.stub.status).toBe("rejected");
      expect(parsed.decision).toContain("Rejected");
    });
  });

  describe("error handling", () => {
    it("throws on invalid severity in front matter", () => {
      const bad = `---
id: test
severity: UNKNOWN
status: pending
llm_enriched: false
test_file: test.ts
prod_files_related: []
commit: abc
parent_commit: def
diff_hash: sha256:000
---

# Test change in \`test.ts\`
`;
      expect(() => parseMarkdown(bad)).toThrow("Invalid severity");
    });

    it("throws on invalid status in front matter", () => {
      const bad = `---
id: test
severity: SAFE
status: invalid
llm_enriched: false
test_file: test.ts
prod_files_related: []
commit: abc
parent_commit: def
diff_hash: sha256:000
---

# Test change in \`test.ts\`
`;
      expect(() => parseMarkdown(bad)).toThrow("Invalid status");
    });

    it("returns empty diff when no diff code block", () => {
      const noDiff = `---
id: test
severity: SAFE
status: pending
llm_enriched: false
test_file: test.ts
prod_files_related: []
commit: abc
parent_commit: def
diff_hash: sha256:000
---

# Test change in \`test.ts\`

## Findings (rule engine)

No findings.

## Analysis

None.
`;
      const parsed = parseMarkdown(noDiff);
      expect(parsed.diff).toBe("");
    });
  });

  describe("full roundtrip", () => {
    it("roundtrips a complete stub with multiple findings", () => {
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

      const result = makeResult({
        findings,
        overallSeverity: Severity.CRITICAL,
      });
      const written = generateStubMarkdown({
        ruleResult: result,
        commit: COMMIT,
        parentCommit: PARENT,
        rawDiff: RAW_DIFF,
        prodFilesRelated: ["src/lib/auth/validate.ts"],
        createdAt: FIXED_DATE,
      });

      const parsed = parseMarkdown(written.content);

      expect(parsed.stub.id).toBe(written.stub.id);
      expect(parsed.stub.created_at).toBe(written.stub.created_at);
      expect(parsed.stub.severity).toBe(written.stub.severity);
      expect(parsed.stub.status).toBe(written.stub.status);
      expect(parsed.stub.llm_enriched).toBe(written.stub.llm_enriched);
      expect(parsed.stub.test_file).toBe(written.stub.test_file);
      expect(parsed.stub.prod_files_related).toEqual(written.stub.prod_files_related);
      expect(parsed.stub.commit).toBe(written.stub.commit);
      expect(parsed.stub.parent_commit).toBe(written.stub.parent_commit);
      expect(parsed.stub.diff_hash).toBe(written.stub.diff_hash);

      expect(parsed.findings).toHaveLength(3);
      expect(parsed.diff).toBe(RAW_DIFF);
    });
  });
});
