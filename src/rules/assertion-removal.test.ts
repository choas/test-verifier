import { describe, test, expect } from "bun:test";
import { detectAssertionRemoval } from "./assertion-removal";
import { Severity } from "../types";

describe("detectAssertionRemoval", () => {
  test("returns no findings when nothing changed", () => {
    const source = `
test('adds', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: source,
      afterSource: source,
    });
    expect(findings).toHaveLength(0);
  });

  test("returns no findings when assertions are added", () => {
    const before = `
test('checks', () => {
  expect(result).toBeDefined();
});
`;
    const after = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(0);
  });

  test("flags assertion removed from existing test as CRITICAL", () => {
    const before = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
  expect(result.items).toHaveLength(3);
});
`;
    const after = `
test('checks', () => {
  expect(result).toBeDefined();
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(2);
    expect(findings[0].rule).toBe("assertion-removal/assertion-removed");
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("toBe");
    expect(findings[0].message).toContain("checks");
    expect(findings[1].rule).toBe("assertion-removal/assertion-removed");
    expect(findings[1].severity).toBe(Severity.CRITICAL);
    expect(findings[1].message).toContain("toHaveLength");
  });

  test("flags entire test deletion as CRITICAL", () => {
    const before = `
test('one', () => { expect(1).toBe(1); });
test('two', () => { expect(2).toBe(2); });
`;
    const after = `
test('one', () => { expect(1).toBe(1); });
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("assertion-removal/test-deleted");
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("two");
  });

  test("flags assertion moved to another test as LOW", () => {
    const before = `
test('all checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
});
`;
    const after = `
test('all checks', () => {
  expect(result).toBeDefined();
});
test('name check', () => {
  expect(result.name).toBe('test');
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("assertion-removal/assertion-moved");
    expect(findings[0].severity).toBe(Severity.LOW);
    expect(findings[0].message).toContain("all checks");
    expect(findings[0].message).toContain("verify destination");
  });

  test("handles nested describe blocks", () => {
    const before = `
describe('math', () => {
  test('adds', () => {
    expect(add(1, 2)).toBe(3);
    expect(add(0, 0)).toBe(0);
  });
});
`;
    const after = `
describe('math', () => {
  test('adds', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("assertion-removal/assertion-removed");
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("math > adds");
  });

  test("returns no findings when both before and after are empty", () => {
    const findings = detectAssertionRemoval({
      beforeSource: "",
      afterSource: "",
    });
    expect(findings).toHaveLength(0);
  });

  test("handles test renamed (old deleted, new added)", () => {
    const before = `
test('old name', () => {
  expect(1).toBe(1);
});
`;
    const after = `
test('new name', () => {
  expect(1).toBe(1);
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("assertion-removal/test-deleted");
    expect(findings[0].message).toContain("old name");
  });

  test("distinguishes removed vs moved when multiple assertions change", () => {
    const before = `
test('full check', () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
  expect(c).toBe(3);
});
`;
    const after = `
test('full check', () => {
  expect(a).toBe(1);
});
test('split check', () => {
  expect(b).toBe(2);
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    const moved = findings.filter((f) => f.rule === "assertion-removal/assertion-moved");
    const removed = findings.filter((f) => f.rule === "assertion-removal/assertion-removed");
    expect(moved).toHaveLength(1);
    expect(moved[0].before).toContain("expect(b).toBe(2)");
    expect(removed).toHaveLength(1);
    expect(removed[0].before).toContain("expect(c).toBe(3)");
  });

  test("handles deeply nested describes", () => {
    const before = `
describe('outer', () => {
  describe('inner', () => {
    test('deep', () => {
      expect(1).toBe(1);
      expect(2).toBe(2);
    });
  });
});
`;
    const after = `
describe('outer', () => {
  describe('inner', () => {
    test('deep', () => {
      expect(1).toBe(1);
    });
  });
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("outer > inner > deep");
  });

  test("all assertions removed from test but test kept", () => {
    const before = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
});
`;
    const after = `
test('checks', () => {
  console.log(result);
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.rule === "assertion-removal/assertion-removed")).toBe(true);
    expect(findings.every((f) => f.severity === Severity.CRITICAL)).toBe(true);
  });

  test("does not flag when assertion text is reformatted", () => {
    const before = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(  result.name  ).toBe('test');
});
`;
    const after = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(0);
  });

  test("handles file with only describe deleted", () => {
    const before = `
describe('suite', () => {
  test('one', () => { expect(1).toBe(1); });
  test('two', () => { expect(2).toBe(2); });
});
`;
    const after = "";
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.rule === "assertion-removal/test-deleted")).toBe(true);
  });

  test("handles new file (no before source)", () => {
    const before = "";
    const after = `
test('new test', () => {
  expect(1).toBe(1);
});
`;
    const findings = detectAssertionRemoval({
      beforeSource: before,
      afterSource: after,
    });
    expect(findings).toHaveLength(0);
  });
});
