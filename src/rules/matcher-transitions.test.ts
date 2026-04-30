import { describe, test, expect } from "bun:test";
import { detectMatcherTransitions, DEFAULT_TRANSITIONS } from "./matcher-transitions";
import { extractTestBlocksPair } from "../test-block-extractor";
import { Severity } from "../types";

function detect(beforeSource: string, afterSource: string) {
  const { before, after } = extractTestBlocksPair(beforeSource, afterSource);
  return detectMatcherTransitions(before, after);
}

describe("detectMatcherTransitions", () => {
  test("no findings when matchers unchanged", () => {
    const src = `test("x", () => { expect(a).toBe(1); });`;
    expect(detect(src, src)).toEqual([]);
  });

  test("no findings for transitions not in table", () => {
    const before = `test("x", () => { expect(a).toContain("b"); });`;
    const after = `test("x", () => { expect(a).toMatch(/b/); });`;
    expect(detect(before, after)).toEqual([]);
  });

  // §5 row 1: toBe → toEqual = SUSPICIOUS
  test("toBe -> toEqual", () => {
    const before = `test("x", () => { expect(a).toBe(1); });`;
    const after = `test("x", () => { expect(a).toEqual(1); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
    expect(findings[0].rule).toBe("matcher-transition");
  });

  // §5 row 2: toBe → toBeDefined = CRITICAL
  test("toBe -> toBeDefined", () => {
    const before = `test("x", () => { expect(a).toBe(42); });`;
    const after = `test("x", () => { expect(a).toBeDefined(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 3: toBe → toBeTruthy = CRITICAL
  test("toBe -> toBeTruthy", () => {
    const before = `test("x", () => { expect(a).toBe(true); });`;
    const after = `test("x", () => { expect(a).toBeTruthy(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 4: toBe → toBeFalsy = CRITICAL
  test("toBe -> toBeFalsy", () => {
    const before = `test("x", () => { expect(a).toBe(false); });`;
    const after = `test("x", () => { expect(a).toBeFalsy(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 5: toEqual → toMatchObject = SUSPICIOUS
  test("toEqual -> toMatchObject", () => {
    const before = `test("x", () => { expect(a).toEqual({ id: 1 }); });`;
    const after = `test("x", () => { expect(a).toMatchObject({ id: 1 }); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  // §5 row 6: toEqual → toBeDefined = CRITICAL
  test("toEqual -> toBeDefined", () => {
    const before = `test("x", () => { expect(a).toEqual({ id: 1 }); });`;
    const after = `test("x", () => { expect(a).toBeDefined(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 7: toStrictEqual → toEqual = SUSPICIOUS
  test("toStrictEqual -> toEqual", () => {
    const before = `test("x", () => { expect(a).toStrictEqual({ id: 1 }); });`;
    const after = `test("x", () => { expect(a).toEqual({ id: 1 }); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  // §5 row 8: toStrictEqual → toMatchObject = CRITICAL
  test("toStrictEqual -> toMatchObject", () => {
    const before = `test("x", () => { expect(a).toStrictEqual({ id: 1 }); });`;
    const after = `test("x", () => { expect(a).toMatchObject({ id: 1 }); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 9: toHaveLength → toBeDefined = CRITICAL
  test("toHaveLength -> toBeDefined", () => {
    const before = `test("x", () => { expect(arr).toHaveLength(3); });`;
    const after = `test("x", () => { expect(arr).toBeDefined(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 10: toThrow → not.toThrow = CRITICAL
  test("toThrow -> not.toThrow", () => {
    const before = `test("x", () => { expect(fn).toThrow(); });`;
    const after = `test("x", () => { expect(fn).not.toThrow(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
  });

  // §5 row 11: toHaveBeenCalledTimes → toHaveBeenCalled = SUSPICIOUS
  test("toHaveBeenCalledTimes -> toHaveBeenCalled", () => {
    const before = `test("x", () => { expect(spy).toHaveBeenCalledTimes(3); });`;
    const after = `test("x", () => { expect(spy).toHaveBeenCalled(); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  // §5 row 12: any matcher → removed entirely = CRITICAL
  test("matcher removed entirely", () => {
    const before = `test("x", () => { expect(a).toBe(1); expect(b).toBe(2); });`;
    const after = `test("x", () => { expect(a).toBe(1); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].after).toBe("");
    expect(findings[0].message).toContain("removed entirely");
  });

  test("multiple transitions in one test", () => {
    const before = `test("x", () => {
      expect(a).toBe(1);
      expect(b).toStrictEqual({});
    });`;
    const after = `test("x", () => {
      expect(a).toEqual(1);
      expect(b).toMatchObject({});
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
    expect(findings[1].severity).toBe(Severity.CRITICAL);
  });

  test("nested describe blocks", () => {
    const before = `describe("suite", () => {
      test("inner", () => { expect(a).toBe(1); });
    });`;
    const after = `describe("suite", () => {
      test("inner", () => { expect(a).toBeDefined(); });
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("suite > inner");
  });

  test("test block removed is not reported", () => {
    const before = `test("x", () => { expect(a).toBe(1); });`;
    const after = ``;
    const findings = detect(before, after);
    expect(findings).toEqual([]);
  });

  test("new test block added is not reported", () => {
    const before = ``;
    const after = `test("x", () => { expect(a).toBe(1); });`;
    const findings = detect(before, after);
    expect(findings).toEqual([]);
  });

  test("custom transition table", () => {
    const table = { "toContain->toMatch": Severity.LOW };
    const before = `test("x", () => { expect(a).toContain("b"); });`;
    const after = `test("x", () => { expect(a).toMatch(/b/); });`;
    const { before: b, after: a } = extractTestBlocksPair(before, after);
    const findings = detectMatcherTransitions(b, a, table);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.LOW);
  });

  test("custom matcherRemovedSeverity", () => {
    const before = `test("x", () => { expect(a).toBe(1); });`;
    const after = `test("x", () => {});`;
    const { before: b, after: a } = extractTestBlocksPair(before, after);
    const findings = detectMatcherTransitions(b, a, DEFAULT_TRANSITIONS, Severity.SUSPICIOUS);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  test("all removed when test body emptied", () => {
    const before = `test("x", () => {
      expect(a).toBe(1);
      expect(b).toEqual(2);
      expect(c).toHaveLength(3);
    });`;
    const after = `test("x", () => {});`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(3);
    for (const f of findings) {
      expect(f.severity).toBe(Severity.CRITICAL);
      expect(f.message).toContain("removed entirely");
    }
  });

  test("finding includes before/after text", () => {
    const before = `test("x", () => { expect(a).toBe(1); });`;
    const after = `test("x", () => { expect(a).toEqual(1); });`;
    const findings = detect(before, after);
    expect(findings[0].before).toContain("toBe");
    expect(findings[0].after).toContain("toEqual");
  });

  test("DEFAULT_TRANSITIONS has all 11 entries", () => {
    expect(Object.keys(DEFAULT_TRANSITIONS)).toHaveLength(11);
  });
});
