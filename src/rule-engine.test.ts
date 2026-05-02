import { describe, it, expect } from "bun:test";
import { runRuleEngine, maxSeverity } from "./rule-engine";
import { Severity, type Finding } from "./types";
import { defineConfig } from "./config";
import type { FileDiff } from "./diff-parser";

function finding(severity: Severity): Finding {
  return {
    rule: "test",
    severity,
    line: 1,
    message: "",
    before: "",
    after: "",
  };
}

describe("maxSeverity", () => {
  it("returns SAFE for empty findings", () => {
    expect(maxSeverity([])).toBe(Severity.SAFE);
  });

  it("returns the highest severity among findings", () => {
    expect(
      maxSeverity([finding(Severity.LOW), finding(Severity.CRITICAL), finding(Severity.SAFE)]),
    ).toBe(Severity.CRITICAL);
  });

  it("returns SUSPICIOUS when no CRITICAL present", () => {
    expect(
      maxSeverity([finding(Severity.SAFE), finding(Severity.SUSPICIOUS), finding(Severity.LOW)]),
    ).toBe(Severity.SUSPICIOUS);
  });

  it("returns LOW when only SAFE and LOW present", () => {
    expect(maxSeverity([finding(Severity.SAFE), finding(Severity.LOW)])).toBe(Severity.LOW);
  });

  it("returns SAFE for single SAFE finding", () => {
    expect(maxSeverity([finding(Severity.SAFE)])).toBe(Severity.SAFE);
  });
});

describe("runRuleEngine", () => {
  it("detects skip + matcher transition on the same file", () => {
    const before = `
      import { describe, it, expect } from "vitest";
      describe("math", () => {
        it("adds numbers", () => {
          expect(1 + 1).toBe(2);
        });
        it("subtracts numbers", () => {
          expect(2 - 1).toBe(1);
        });
      });
    `;
    const after = `
      import { describe, it, expect } from "vitest";
      describe("math", () => {
        it.skip("adds numbers", () => {
          expect(1 + 1).toBe(2);
        });
        it("subtracts numbers", () => {
          expect(2 - 1).toEqual(1);
        });
      });
    `;

    const result = runRuleEngine({
      filePath: "math.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("detects tautology and value change together", () => {
    const before = `
      import { it, expect } from "vitest";
      it("checks value", () => {
        expect(getValue()).toBe(42);
      });
      it("checks flag", () => {
        expect(isActive()).toBe(false);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("checks value", () => {
        expect(getValue()).toBe(99);
      });
      it("checks flag", () => {
        expect(true).toBe(true);
      });
    `;

    const result = runRuleEngine({
      filePath: "values.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const valueFindings = result.findings.filter((f) => f.rule === "value-change");
    const tautFindings = result.findings.filter((f) => f.rule.startsWith("tautology"));
    expect(valueFindings.length).toBeGreaterThan(0);
    expect(tautFindings.length).toBeGreaterThan(0);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("classifies new test file as SAFE when no issues found", () => {
    const result = runRuleEngine({
      filePath: "new.test.ts",
      beforeContent: "",
      afterContent: `
        import { it, expect } from "vitest";
        it("works", () => {
          expect(getValue()).toBe(42);
        });
      `,
      config: defineConfig(),
    });

    const safeFindings = result.findings.filter((f) => f.severity === Severity.SAFE);
    expect(safeFindings.length).toBeGreaterThan(0);
    expect(result.overallSeverity).toBe(Severity.SAFE);
  });

  it("detects assertion removal + value change on complex diff", () => {
    const before = `
      import { describe, it, expect } from "vitest";
      describe("api", () => {
        it("returns correct status", () => {
          expect(response.status).toBe(200);
        });
        it("returns data", () => {
          expect(response.data).toEqual({ name: "test" });
          expect(response.data.id).toBe(1);
        });
      });
    `;
    const after = `
      import { describe, it, expect } from "vitest";
      describe("api", () => {
        it("returns correct status", () => {
          expect(response.status).toBe(201);
        });
        it("returns data", () => {
          expect(response.data).toEqual({ name: "test" });
        });
      });
    `;

    const result = runRuleEngine({
      filePath: "api.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const valueFindings = result.findings.filter((f) => f.rule === "value-change");
    const removalFindings = result.findings.filter((f) => f.rule.startsWith("assertion-removal"));
    expect(valueFindings.length).toBeGreaterThan(0);
    expect(removalFindings.length).toBeGreaterThan(0);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("respects assertionRemoved severity override", () => {
    const before = `
      import { it, expect } from "vitest";
      it("has assertions", () => {
        expect(foo()).toBe(1);
        expect(bar()).toBe(2);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("has assertions", () => {
        expect(foo()).toBe(1);
      });
    `;

    const overrideResult = runRuleEngine({
      filePath: "removal.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({
        rules: { assertionRemoved: Severity.SUSPICIOUS },
      }),
    });

    expect(overrideResult.findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  it.skip("respects matcher transition table overrides", () => {
    const before = `
      import { it, expect } from "vitest";
      it("checks equality", () => {
        expect(obj).toBe(expected);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("checks equality", () => {
        expect(obj).toEqual(expected);
      });
    `;

    const result = runRuleEngine({
      filePath: "matcher.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({
        rules: { matcherTransitions: { "toBe->toEqual": Severity.LOW } },
      }),
    });

    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
    expect(matcherFindings[0].severity).toBe(Severity.LOW);
  });

  it("respects skip annotation severity override", () => {
    const before = `
      import { it, expect } from "vitest";
      it("test one", () => {
        expect(getValue()).toBe(1);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it.skip("test one", () => {
        expect(getValue()).toBe(1);
      });
    `;

    const result = runRuleEngine({
      filePath: "skip.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({ rules: { skipAnnotation: Severity.SUSPICIOUS } }),
    });

    const skipFindings = result.findings.filter((f) => f.rule.startsWith("skip-detector"));
    expect(skipFindings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  it("respects tautology severity override", () => {
    const before = `
      import { it, expect } from "vitest";
      it("checks flag", () => {
        expect(isActive()).toBe(true);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("checks flag", () => {
        expect(true).toBe(true);
      });
    `;

    const result = runRuleEngine({
      filePath: "taut.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({ rules: { tautology: { static: Severity.LOW } } }),
    });

    const tautFindings = result.findings.filter((f) => f.rule.startsWith("tautology"));
    expect(tautFindings.length).toBeGreaterThan(0);
    for (const f of tautFindings) {
      expect(f.severity).toBe(Severity.LOW);
    }
  });

  it("includes snapshot findings when diffs are provided", () => {
    const snapDiff: FileDiff = {
      oldPath: "src/__snapshots__/app.test.ts.snap",
      newPath: "src/__snapshots__/app.test.ts.snap",
      hunks: [
        {
          oldStart: 1,
          oldCount: 3,
          newStart: 1,
          newCount: 3,
          header: "",
          lines: [
            {
              type: "context",
              content: "exports[`app renders`] = `",
              oldLineNumber: 1,
              newLineNumber: 1,
            },
            {
              type: "removed",
              content: "<div>old</div>",
              oldLineNumber: 2,
              newLineNumber: null,
            },
            {
              type: "added",
              content: "<div>new</div>",
              oldLineNumber: null,
              newLineNumber: 2,
            },
            {
              type: "context",
              content: "`;",
              oldLineNumber: 3,
              newLineNumber: 3,
            },
          ],
        },
      ],
    };

    const result = runRuleEngine({
      filePath: "app.test.ts",
      beforeContent: "",
      afterContent: "",
      diffs: [snapDiff],
      config: defineConfig(),
    });

    const snapshotFindings = result.findings.filter((f) => f.rule.startsWith("snapshot"));
    expect(snapshotFindings.length).toBeGreaterThan(0);
  });

  it("returns correct filePath in result", () => {
    const result = runRuleEngine({
      filePath: "src/utils.test.ts",
      beforeContent: "",
      afterContent: "",
      config: defineConfig(),
    });

    expect(result.filePath).toBe("src/utils.test.ts");
  });

  it("returns SAFE with no non-safe findings for identical content", () => {
    const content = `
      import { it, expect } from "vitest";
      it("works", () => {
        expect(getValue()).toBe(42);
      });
    `;

    const result = runRuleEngine({
      filePath: "same.test.ts",
      beforeContent: content,
      afterContent: content,
      config: defineConfig(),
    });

    const nonSafe = result.findings.filter((f) => f.severity !== Severity.SAFE);
    expect(nonSafe).toHaveLength(0);
    expect(result.overallSeverity).toBe(Severity.SAFE);
  });

  it("handles multiple rules firing with overall severity as max", () => {
    const before = `
      import { describe, it, expect } from "vitest";
      describe("suite", () => {
        it("test a", () => {
          expect(getVal()).toBe(10);
        });
        it("test b", () => {
          expect(result).toStrictEqual(expected);
        });
        it("test c", () => {
          expect(flag).toBe(true);
        });
      });
    `;
    const after = `
      import { describe, it, expect } from "vitest";
      describe("suite", () => {
        it("test a", () => {
          expect(getVal()).toBe(20);
        });
        it("test b", () => {
          expect(result).toEqual(expected);
        });
        it.skip("test c", () => {
          expect(flag).toBe(true);
        });
      });
    `;

    const result = runRuleEngine({
      filePath: "multi.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const rules = new Set(result.findings.map((f) => f.rule));
    expect(rules.size).toBeGreaterThan(1);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("detects multi-assertion weakening in a single test", () => {
    const before = `
      import { it, expect } from "vitest";
      it("validates response", () => {
        expect(response.status).toBe(200);
        expect(response.body).toStrictEqual({ id: 1, name: "test" });
        expect(response.headers).toHaveLength(3);
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("validates response", () => {
        expect(response.status).toBeTruthy();
        expect(response.body).toMatchObject({ id: 1, name: "test" });
        expect(response.headers).toBeDefined();
      });
    `;

    const result = runRuleEngine({
      filePath: "multi-weaken.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
    expect(matcherFindings.length).toBe(3);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("detects multi-assertion weakening across nested describes", () => {
    const before = `
      import { describe, it, expect } from "vitest";
      describe("auth", () => {
        describe("login", () => {
          it("validates credentials", () => {
            expect(result.token).toBe("abc123");
            expect(result.expires).toBe(3600);
          });
        });
        describe("logout", () => {
          it("clears session", () => {
            expect(session.active).toBe(false);
          });
        });
      });
    `;
    const after = `
      import { describe, it, expect } from "vitest";
      describe("auth", () => {
        describe("login", () => {
          it("validates credentials", () => {
            expect(result.token).toBeDefined();
            expect(result.expires).toBeTruthy();
          });
        });
        describe("logout", () => {
          it("clears session", () => {
            expect(session.active).toBeFalsy();
          });
        });
      });
    `;

    const result = runRuleEngine({
      filePath: "auth.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
    expect(matcherFindings.length).toBe(3);
    expect(
      matcherFindings.some((f) => f.message.includes("auth > login > validates credentials")),
    ).toBe(true);
    expect(matcherFindings.some((f) => f.message.includes("auth > logout > clears session"))).toBe(
      true,
    );
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("detects combined weakening: assertion removal + matcher downgrade + skip", () => {
    const before = `
      import { describe, it, expect } from "vitest";
      describe("payment", () => {
        it("processes charge", () => {
          expect(charge.amount).toBe(100);
          expect(charge.currency).toBe("USD");
          expect(charge.status).toBe("success");
        });
        it("sends receipt", () => {
          expect(receipt.sent).toBe(true);
        });
      });
    `;
    const after = `
      import { describe, it, expect } from "vitest";
      describe("payment", () => {
        it("processes charge", () => {
          expect(charge.amount).toBeDefined();
        });
        it.skip("sends receipt", () => {
          expect(receipt.sent).toBe(true);
        });
      });
    `;

    const result = runRuleEngine({
      filePath: "payment.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const removalFindings = result.findings.filter((f) => f.rule.startsWith("assertion-removal"));
    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");
    const skipFindings = result.findings.filter((f) => f.rule.startsWith("skip-detector"));
    expect(removalFindings.length).toBeGreaterThan(0);
    expect(matcherFindings.length).toBeGreaterThan(0);
    expect(skipFindings.length).toBeGreaterThan(0);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });

  it("handles non-ASCII content in test names and values", () => {
    const before = `
      import { it, expect } from "vitest";
      it("翻訳テスト", () => {
        expect(translate("greeting")).toBe("こんにちは");
      });
    `;
    const after = `
      import { it, expect } from "vitest";
      it("翻訳テスト", () => {
        expect(translate("greeting")).toBe("Привет");
      });
    `;

    const result = runRuleEngine({
      filePath: "i18n.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });

    const valueFindings = result.findings.filter((f) => f.rule === "value-change");
    expect(valueFindings.length).toBe(1);
  });
});
