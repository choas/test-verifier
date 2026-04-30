import { describe, it, expect } from "bun:test";
import { runRuleEngine, maxSeverity } from "./rule-engine";
import { Severity, type Finding } from "./types";
import { defineConfig } from "./config";
import type { FileDiff } from "./diff-parser";

function finding(severity: Severity): Finding {
  return { rule: "test", severity, line: 1, message: "", before: "", after: "" };
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

    const skipFindings = result.findings.filter((f) => f.rule === "skip-detector");
    const matcherFindings = result.findings.filter((f) => f.rule === "matcher-transition");

    expect(skipFindings.length).toBeGreaterThanOrEqual(1);
    expect(matcherFindings.length).toBeGreaterThanOrEqual(1);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
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

    const tautologyFindings = result.findings.filter((f) => f.rule.startsWith("tautology/"));
    const valueFindings = result.findings.filter((f) => f.rule === "value-change");

    expect(tautologyFindings.length).toBeGreaterThanOrEqual(1);
    expect(valueFindings.length).toBeGreaterThanOrEqual(1);
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

    const safeFindings = result.findings.filter((f) => f.rule.startsWith("safe/"));
    expect(safeFindings.length).toBeGreaterThanOrEqual(1);
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
    const removedFindings = result.findings.filter((f) =>
      f.rule.startsWith("assertion-removal"),
    );

    expect(valueFindings.length).toBeGreaterThanOrEqual(1);
    expect(removedFindings.length).toBeGreaterThanOrEqual(1);
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

    const defaultResult = runRuleEngine({
      filePath: "removal.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });
    const defaultRemoval = defaultResult.findings.filter((f) =>
      f.rule.startsWith("assertion-removal"),
    );
    expect(defaultRemoval.some((f) => f.severity === Severity.CRITICAL)).toBe(true);

    const overrideResult = runRuleEngine({
      filePath: "removal.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({ rules: { assertionRemoved: Severity.SUSPICIOUS } }),
    });
    const overrideRemoval = overrideResult.findings.filter((f) =>
      f.rule.startsWith("assertion-removal"),
    );
    expect(overrideRemoval.every((f) => f.severity !== Severity.CRITICAL)).toBe(true);
    expect(overrideRemoval.some((f) => f.severity === Severity.SUSPICIOUS)).toBe(true);
  });

  it("respects matcher transition table overrides", () => {
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

    const defaultResult = runRuleEngine({
      filePath: "matcher.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig(),
    });
    const defaultMatcher = defaultResult.findings.filter((f) => f.rule === "matcher-transition");
    expect(defaultMatcher[0].severity).toBe(Severity.SUSPICIOUS);

    const overrideResult = runRuleEngine({
      filePath: "matcher.test.ts",
      beforeContent: before,
      afterContent: after,
      config: defineConfig({
        rules: { matcherTransitions: { "toBe->toEqual": Severity.CRITICAL } },
      }),
    });
    const overrideMatcher = overrideResult.findings.filter((f) => f.rule === "matcher-transition");
    expect(overrideMatcher[0].severity).toBe(Severity.CRITICAL);
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

    const skipFindings = result.findings.filter((f) => f.rule === "skip-detector");
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

    const tautFindings = result.findings.filter((f) => f.rule.startsWith("tautology/"));
    expect(tautFindings.length).toBeGreaterThanOrEqual(1);
    expect(tautFindings.every((f) => f.severity === Severity.LOW)).toBe(true);
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
            { type: "context", content: "exports[`app renders`] = `", oldLineNumber: 1, newLineNumber: 1 },
            { type: "removed", content: "<div>old</div>", oldLineNumber: 2, newLineNumber: null },
            { type: "added", content: "<div>new</div>", oldLineNumber: null, newLineNumber: 2 },
            { type: "context", content: "`;", oldLineNumber: 3, newLineNumber: 3 },
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

    const snapFindings = result.findings.filter((f) => f.rule.startsWith("snapshot/"));
    expect(snapFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns correct filePath in result", () => {
    const result = runRuleEngine({
      filePath: "src/utils.test.ts",
      beforeContent: "",
      afterContent: "",
      config: defineConfig(),
    });

    expect(result.filePath).toBe("src/utils.test.ts");
    expect(result.overallSeverity).toBe(Severity.SAFE);
  });

  it("returns SAFE with no findings for identical content", () => {
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
    expect(rules.has("value-change")).toBe(true);
    expect(rules.has("matcher-transition")).toBe(true);
    expect(rules.has("skip-detector")).toBe(true);
    expect(result.overallSeverity).toBe(Severity.CRITICAL);
  });
});
