import { describe, test, expect } from "bun:test";
import { detectTautologies } from "./tautology-detector";
import { Severity } from "../types";

describe("tautology-detector", () => {
  describe("literal-match: both sides are the same literal", () => {
    test("flags expect(true).toBe(true)", () => {
      const source = `
test('always passes', () => {
  expect(true).toBe(true);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
      expect(findings[0].severity).toBe(Severity.CRITICAL);
      expect(findings[0].message).toContain("true");
    });

    test("flags expect(1).toBe(1)", () => {
      const source = `
test('number tautology', () => {
  expect(1).toBe(1);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });

    test("flags expect('hello').toBe('hello')", () => {
      const source = `
test('string tautology', () => {
  expect('hello').toBe('hello');
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });

    test("flags expect(null).toBe(null)", () => {
      const source = `
test('null tautology', () => {
  expect(null).toBe(null);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });

    test("flags expect(false).toEqual(false)", () => {
      const source = `
test('false tautology', () => {
  expect(false).toEqual(false);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });
  });

  describe("literal-both-sides: different literals on both sides", () => {
    test("flags expect(1).toBe(2)", () => {
      const source = `
test('mismatched literals', () => {
  expect(1).toBe(2);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-both-sides");
      expect(findings[0].message).toContain("1");
      expect(findings[0].message).toContain("2");
    });

    test("flags expect(true).toBe(false)", () => {
      const source = `
test('bool mismatch', () => {
  expect(true).toBe(false);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-both-sides");
    });
  });

  describe("same-identifier: expect(x).toEqual(x)", () => {
    test("flags expect(x).toEqual(x)", () => {
      const source = `
test('same var', () => {
  const x = getValue();
  expect(x).toEqual(x);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/same-identifier");
      expect(findings[0].message).toContain("x");
    });

    test("flags expect(result).toBe(result)", () => {
      const source = `
test('same var toBe', () => {
  const result = compute();
  expect(result).toBe(result);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/same-identifier");
    });

    test("flags expect(obj.prop).toEqual(obj.prop)", () => {
      const source = `
test('same member expression', () => {
  expect(obj.prop).toEqual(obj.prop);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/same-identifier");
    });

    test("does not flag expect(a).toEqual(b)", () => {
      const source = `
test('different vars', () => {
  expect(a).toEqual(b);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });
  });

  describe("no-assertions: test bodies with zero assertion calls", () => {
    test("flags test with no expect calls", () => {
      const source = `
test('does nothing', () => {
  const x = 1 + 1;
  console.log(x);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/no-assertions");
      expect(findings[0].message).toContain("does nothing");
    });

    test("flags empty test body", () => {
      const source = `
test('empty', () => {});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/no-assertions");
    });

    test("does not flag test with expect call", () => {
      const source = `
test('has assertion', () => {
  expect(getValue()).toBe(42);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with chained expect", () => {
      const source = `
test('has chained assertion', () => {
  expect(getValue()).not.toBe(0);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with resolves assertion", () => {
      const source = `
test('has async assertion', async () => {
  await expect(fetchData()).resolves.toBeDefined();
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.equal", () => {
      const source = `
test('uses node:assert', () => {
  const result = add(1, 2);
  assert.equal(result, 3);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.ok", () => {
      const source = `
test('uses assert.ok', () => {
  assert.ok(isValid());
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.deepEqual", () => {
      const source = `
test('uses assert.deepEqual', () => {
  assert.deepEqual(getObj(), { a: 1 });
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.match", () => {
      const source = `
test('uses assert.match', () => {
  assert.match(getMessage(), /hello/);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with bare assert()", () => {
      const source = `
test('uses bare assert', () => {
  assert(result !== null);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.strictEqual", () => {
      const source = `
test('uses assert.strictEqual', () => {
  assert.strictEqual(result, expected);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("does not flag test with assert.throws", () => {
      const source = `
test('uses assert.throws', () => {
  assert.throws(() => riskyFn(), /error/);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });
  });

  describe("truthy-mock: mockReturnValue is always-truthy for non-trivial signatures", () => {
    test("flags mockReturnValue(true) on mock with non-trivial signature", () => {
      const source = `
const mockFn = jest.fn((x: number) => x * 2);
test('uses mock', () => {
  mockFn.mockReturnValue(true);
  expect(mockFn(5)).toBe(true);
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(1);
      expect(mockFindings[0].message).toContain("mockReturnValue(true)");
    });

    test("flags mockResolvedValue({}) on mock with non-trivial signature", () => {
      const source = `
const mockFetch = jest.fn((url: string) => Promise.resolve({}));
test('mock resolved', () => {
  mockFetch.mockResolvedValue({});
  expect(mockFetch('http://example.com')).resolves.toBeDefined();
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(1);
      expect(mockFindings[0].message).toContain("mockResolvedValue");
    });

    test("flags mockReturnValue with non-empty string", () => {
      const source = `
const mockGet = jest.fn((key: string) => 'default');
test('mock string', () => {
  mockGet.mockReturnValue('always');
  expect(mockGet('key')).toBe('always');
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(1);
    });

    test("does not flag mockReturnValue(false)", () => {
      const source = `
const mockFn = jest.fn((x: number) => x > 0);
test('mock false', () => {
  mockFn.mockReturnValue(false);
  expect(mockFn(-1)).toBe(false);
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(0);
    });

    test("does not flag mockReturnValue(0)", () => {
      const source = `
const mockFn = jest.fn((x: number) => x);
test('mock zero', () => {
  mockFn.mockReturnValue(0);
  expect(mockFn(0)).toBe(0);
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(0);
    });

    test("does not flag mock without non-trivial signature", () => {
      const source = `
const mockFn = jest.fn();
test('trivial mock', () => {
  mockFn.mockReturnValue(true);
  expect(mockFn()).toBe(true);
});`;
      const findings = detectTautologies(source);
      const mockFindings = findings.filter((f) => f.rule === "tautology/truthy-mock");
      expect(mockFindings).toHaveLength(0);
    });
  });

  describe("severity configuration", () => {
    test("uses CRITICAL by default", () => {
      const source = `
test('taut', () => {
  expect(true).toBe(true);
});`;
      const findings = detectTautologies(source);
      expect(findings[0].severity).toBe(Severity.CRITICAL);
    });

    test("respects custom severity", () => {
      const source = `
test('taut', () => {
  expect(true).toBe(true);
});`;
      const findings = detectTautologies(source, "test.ts", {
        severity: Severity.SUSPICIOUS,
      });
      expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
    });
  });

  describe("multiple findings in one file", () => {
    test("detects multiple tautologies", () => {
      const source = `
test('taut 1', () => {
  expect(true).toBe(true);
});
test('taut 2', () => {
  expect(x).toEqual(x);
});
test('no assert', () => {
  console.log('hello');
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(3);

      const rules = findings.map((f) => f.rule).sort();
      expect(rules).toContain("tautology/literal-match");
      expect(rules).toContain("tautology/same-identifier");
      expect(rules).toContain("tautology/no-assertions");
    });
  });

  describe("edge cases", () => {
    test("does not flag legitimate assertions", () => {
      const source = `
test('real test', () => {
  const result = add(1, 2);
  expect(result).toBe(3);
  expect(result).not.toBe(4);
  expect(result).toBeGreaterThan(0);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(0);
    });

    test("handles it() blocks the same as test()", () => {
      const source = `
it('always passes', () => {
  expect(true).toBe(true);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });

    test("handles nested describe blocks", () => {
      const source = `
describe('outer', () => {
  describe('inner', () => {
    test('taut', () => {
      expect(1).toBe(1);
    });
  });
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/literal-match");
    });

    test("handles expect through .not chain for same identifier", () => {
      const source = `
test('not chain same id', () => {
  expect(x).not.toEqual(x);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("tautology/same-identifier");
    });

    test("populates line number and before fields", () => {
      const source = `
test('taut', () => {
  expect(true).toBe(true);
});`;
      const findings = detectTautologies(source);
      expect(findings).toHaveLength(1);
      expect(findings[0].line).toBeGreaterThan(0);
      expect(findings[0].before).toContain("expect(true).toBe(true)");
    });
  });
});
