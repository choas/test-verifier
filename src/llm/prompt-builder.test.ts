import { describe, expect, test } from "bun:test";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder";

describe("buildSystemPrompt", () => {
  test("snapshot", () => {
    expect(buildSystemPrompt()).toMatchSnapshot();
  });
});

describe("buildUserPrompt", () => {
  test("full input with findings and prod diffs", () => {
    const prompt = buildUserPrompt({
      testFilePath: "src/auth/validate.test.ts",
      testDiff: [
        "--- a/src/auth/validate.test.ts",
        "+++ b/src/auth/validate.test.ts",
        "@@ -10,7 +10,7 @@",
        " test('rejects expired tokens', () => {",
        "   const result = validate(expiredToken);",
        "-  expect(result).toBe(false);",
        "+  expect(result).toBeDefined();",
        " });",
      ].join("\n"),
      ruleFindings: [
        {
          rule: "matcher-transition",
          severity: "CRITICAL",
          message: "toBe → toBeDefined: strict equality replaced with existence check",
          line: 12,
        },
      ],
      relatedProdDiffs: [
        "--- a/src/auth/validate.ts",
        "+++ b/src/auth/validate.ts",
        "@@ -5,7 +5,7 @@",
        " export function validate(token: string): boolean {",
        "-  return checkExpiry(token);",
        "+  return true;",
        " }",
      ].join("\n"),
    });

    expect(prompt).toMatchSnapshot();
  });

  test("multiple findings, no prod diffs", () => {
    const prompt = buildUserPrompt({
      testFilePath: "src/tax/calculate.test.ts",
      testDiff: [
        "--- a/src/tax/calculate.test.ts",
        "+++ b/src/tax/calculate.test.ts",
        "@@ -3,8 +3,6 @@",
        " describe('tax calculation', () => {",
        "-  test('applies standard rate', () => {",
        "-    expect(calculateTax(100)).toBe(19);",
        "-  });",
        "+  test.skip('applies standard rate', () => {",
        "+    expect(calculateTax(100)).toBe(19);",
        "+  });",
        "   test('zero for exempt items', () => {",
        "-    expect(calculateTax(0)).toBe(0);",
        "+    expect(calculateTax(0)).toBeDefined();",
        "   });",
      ].join("\n"),
      ruleFindings: [
        {
          rule: "skip-detector",
          severity: "CRITICAL",
          message: "test 'applies standard rate' changed from active to skipped",
          line: 4,
        },
        {
          rule: "matcher-transition",
          severity: "SUSPICIOUS",
          message: "toBe → toBeDefined: strict equality replaced with existence check",
          line: 9,
        },
      ],
      relatedProdDiffs: "",
    });

    expect(prompt).toMatchSnapshot();
  });

  test("no findings, with prod diffs", () => {
    const prompt = buildUserPrompt({
      testFilePath: "src/utils/format.test.ts",
      testDiff: [
        "--- a/src/utils/format.test.ts",
        "+++ b/src/utils/format.test.ts",
        "@@ -1,5 +1,5 @@",
        " test('formats currency', () => {",
        "-  expect(format(1000)).toBe('$1,000.00');",
        "+  expect(format(1000)).toBe('€1.000,00');",
        " });",
      ].join("\n"),
      ruleFindings: [],
      relatedProdDiffs: [
        "--- a/src/utils/format.ts",
        "+++ b/src/utils/format.ts",
        "@@ -1,3 +1,3 @@",
        "-const locale = 'en-US';",
        "+const locale = 'de-DE';",
        " export function format(n: number) {",
      ].join("\n"),
    });

    expect(prompt).toMatchSnapshot();
  });

  test("no findings, no prod diffs", () => {
    const prompt = buildUserPrompt({
      testFilePath: "src/components/Button.test.ts",
      testDiff: [
        "--- a/src/components/Button.test.ts",
        "+++ b/src/components/Button.test.ts",
        "@@ -5,3 +5,7 @@",
        " test('renders label', () => {",
        "   expect(render(<Button />).text).toBe('Click');",
        " });",
        "+test('renders disabled state', () => {",
        "+  expect(render(<Button disabled />).getAttribute('disabled')).toBe('');",
        "+});",
      ].join("\n"),
      ruleFindings: [],
      relatedProdDiffs: "",
    });

    expect(prompt).toMatchSnapshot();
  });
});
