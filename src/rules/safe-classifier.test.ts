import { describe, test, expect } from "bun:test";
import { classifySafeChanges } from "./safe-classifier";
import { Severity } from "../types";

describe("classifySafeChanges", () => {
  test("returns no findings when source is identical", () => {
    const source = `test('x', () => { expect(1).toBe(1); });`;
    const findings = classifySafeChanges({ beforeSource: source, afterSource: source });
    expect(findings).toHaveLength(0);
  });

  test("returns no findings when both sources are empty", () => {
    const findings = classifySafeChanges({ beforeSource: "", afterSource: "" });
    expect(findings).toHaveLength(0);
  });

  test("returns no findings when file is deleted", () => {
    const before = `test('x', () => { expect(1).toBe(1); });`;
    const findings = classifySafeChanges({ beforeSource: before, afterSource: "" });
    expect(findings).toHaveLength(0);
  });

  // --- New test file ---

  describe("safe/new-test-file", () => {
    test("classifies new test file as safe", () => {
      const after = `
test('adds', () => {
  expect(1 + 2).toBe(3);
});
`;
      const findings = classifySafeChanges({ beforeSource: "", afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/new-test-file");
      expect(findings[0].severity).toBe(Severity.SAFE);
      expect(findings[0].message).toContain("1 test(s)");
    });

    test("counts multiple tests in new file", () => {
      const after = `
describe('math', () => {
  test('adds', () => { expect(1 + 2).toBe(3); });
  test('subtracts', () => { expect(3 - 1).toBe(2); });
  test('multiplies', () => { expect(2 * 3).toBe(6); });
});
`;
      const findings = classifySafeChanges({ beforeSource: "", afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("3 test(s)");
    });

    test("counts tests across nested describes", () => {
      const after = `
describe('outer', () => {
  describe('inner', () => {
    it('works', () => { expect(true).toBe(true); });
  });
  test('also works', () => { expect(1).toBe(1); });
});
`;
      const findings = classifySafeChanges({ beforeSource: "", afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("2 test(s)");
    });

    test("returns no findings for new file without test blocks", () => {
      const after = `export function helper() { return 42; }`;
      const findings = classifySafeChanges({ beforeSource: "", afterSource: after });
      expect(findings).toHaveLength(0);
    });
  });

  // --- Formatting-only ---

  describe("safe/formatting-only", () => {
    test("detects whitespace-only changes", () => {
      const before = `test('x',()=>{expect(1).toBe(1)});`;
      const after = `test('x', () => {\n  expect(1).toBe(1)\n});`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/formatting-only");
      expect(findings[0].severity).toBe(Severity.SAFE);
    });

    test("detects semicolon additions/removals", () => {
      const before = `test('x', () => {\n  expect(1).toBe(1)\n})`;
      const after = `test('x', () => {\n  expect(1).toBe(1);\n});`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/formatting-only");
    });

    test("detects trailing comma changes", () => {
      const before = `const arr = [\n  1,\n  2,\n  3\n]`;
      const after = `const arr = [\n  1,\n  2,\n  3,\n]`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/formatting-only");
    });

    test("detects indentation changes", () => {
      const before = `test('x', () => {\n    expect(1).toBe(1);\n});`;
      const after = `test('x', () => {\n  expect(1).toBe(1);\n});`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/formatting-only");
    });

    test("does not classify value changes as formatting", () => {
      const before = `test('x', () => { expect(1).toBe(1); });`;
      const after = `test('x', () => { expect(1).toBe(2); });`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const formatting = findings.filter((f) => f.rule === "safe/formatting-only");
      expect(formatting).toHaveLength(0);
    });
  });

  // --- Type annotations ---

  describe("safe/type-annotation-only", () => {
    test("detects variable type annotation addition", () => {
      const before = `const x = 1;`;
      const after = `const x: number = 1;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/type-annotation-only");
      expect(findings[0].severity).toBe(Severity.SAFE);
    });

    test("detects return type annotation addition", () => {
      const before = `const fn = () => { return 1; }`;
      const after = `const fn = (): number => { return 1; }`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/type-annotation-only");
    });

    test("detects import type addition", () => {
      const before = `const x = 1;`;
      const after = `import type { Foo } from './foo';\nconst x = 1;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/type-annotation-only");
    });

    test("detects type alias addition", () => {
      const before = `const x = 1;`;
      const after = `type MyType = string | number;\nconst x = 1;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/type-annotation-only");
    });

    test("does not classify value changes as type-only", () => {
      const before = `const x: string = "hello";`;
      const after = `const x: number = 42;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const typeOnly = findings.filter((f) => f.rule === "safe/type-annotation-only");
      expect(typeOnly).toHaveLength(0);
    });

    test("handles combined type annotation and formatting changes", () => {
      const before = `const x = 1`;
      const after = `const x: number = 1;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/type-annotation-only");
    });
  });

  // --- New test blocks ---

  describe("safe/new-test-block", () => {
    test("detects new test added without modifying existing", () => {
      const before = `
test('one', () => {
  expect(1).toBe(1);
});
`;
      const after = `
test('one', () => {
  expect(1).toBe(1);
});

test('two', () => {
  expect(2).toBe(2);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/new-test-block");
      expect(findings[0].severity).toBe(Severity.SAFE);
      expect(findings[0].message).toContain("1 new test(s)");
    });

    test("detects multiple new tests added", () => {
      const before = `
test('one', () => {
  expect(1).toBe(1);
});
`;
      const after = `
test('one', () => {
  expect(1).toBe(1);
});

test('two', () => {
  expect(2).toBe(2);
});

test('three', () => {
  expect(3).toBe(3);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const newBlocks = findings.filter((f) => f.rule === "safe/new-test-block");
      expect(newBlocks).toHaveLength(1);
      expect(newBlocks[0].message).toContain("2 new test(s)");
    });

    test("detects new test inside existing describe", () => {
      const before = `
describe('math', () => {
  test('adds', () => {
    expect(1 + 2).toBe(3);
  });
});
`;
      const after = `
describe('math', () => {
  test('adds', () => {
    expect(1 + 2).toBe(3);
  });

  test('subtracts', () => {
    expect(3 - 1).toBe(2);
  });
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const newBlocks = findings.filter((f) => f.rule === "safe/new-test-block");
      expect(newBlocks).toHaveLength(1);
    });

    test("returns no findings when existing test is modified", () => {
      const before = `
test('one', () => {
  expect(1).toBe(1);
});
`;
      const after = `
test('one', () => {
  expect(1).toBe(2);
});

test('two', () => {
  expect(2).toBe(2);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(0);
    });

    test("returns no findings when test is deleted", () => {
      const before = `
test('one', () => {
  expect(1).toBe(1);
});
test('two', () => {
  expect(2).toBe(2);
});
`;
      const after = `
test('one', () => {
  expect(1).toBe(1);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(0);
    });
  });

  // --- New assertions ---

  describe("safe/new-assertion", () => {
    test("detects new assertion added to existing test", () => {
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
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/new-assertion");
      expect(findings[0].severity).toBe(Severity.SAFE);
    });

    test("returns no findings when assertion is removed", () => {
      const before = `
test('checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
});
`;
      const after = `
test('checks', () => {
  expect(result).toBeDefined();
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(0);
    });

    test("returns no findings when assertion expected value changes", () => {
      const before = `
test('checks', () => {
  expect(result.name).toBe('hello');
});
`;
      const after = `
test('checks', () => {
  expect(result.name).toBe('world');
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(0);
    });

    test("detects both new test block and new assertion", () => {
      const before = `
test('one', () => {
  expect(1).toBe(1);
});
`;
      const after = `
test('one', () => {
  expect(1).toBe(1);
  expect(1).toBeGreaterThan(0);
});

test('two', () => {
  expect(2).toBe(2);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const newBlock = findings.filter((f) => f.rule === "safe/new-test-block");
      const newAssertion = findings.filter((f) => f.rule === "safe/new-assertion");
      expect(newBlock).toHaveLength(1);
      expect(newAssertion).toHaveLength(1);
    });

    test("handles new assertion with supporting setup code", () => {
      const before = `
test('checks', () => {
  expect(result).toBeDefined();
});
`;
      const after = `
test('checks', () => {
  expect(result).toBeDefined();
  const items = result.getItems();
  expect(items).toHaveLength(3);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/new-assertion");
    });
  });

  // --- Identifier rename ---

  describe("safe/identifier-rename", () => {
    test("detects variable rename", () => {
      const before = `
test('checks', () => {
  const result = getValue();
  expect(result).toBe(42);
});
`;
      const after = `
test('checks', () => {
  const output = getValue();
  expect(output).toBe(42);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/identifier-rename");
      expect(findings[0].severity).toBe(Severity.SAFE);
      expect(findings[0].message).toContain("result");
      expect(findings[0].message).toContain("output");
    });

    test("rejects rename that changes call target", () => {
      const before = `
test('checks', () => {
  const x = add(1, 2);
  expect(x).toBe(3);
});
`;
      const after = `
test('checks', () => {
  const x = subtract(1, 2);
  expect(x).toBe(3);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const renames = findings.filter((f) => f.rule === "safe/identifier-rename");
      expect(renames).toHaveLength(0);
    });

    test("rejects rename that changes property access", () => {
      const before = `
test('checks', () => {
  expect(obj.name).toBe('test');
});
`;
      const after = `
test('checks', () => {
  expect(obj.label).toBe('test');
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const renames = findings.filter((f) => f.rule === "safe/identifier-rename");
      expect(renames).toHaveLength(0);
    });

    test("rejects inconsistent rename", () => {
      const before = `const x = 1;\nconst x = 2;`;
      const after = `const a = 1;\nconst b = 2;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const renames = findings.filter((f) => f.rule === "safe/identifier-rename");
      expect(renames).toHaveLength(0);
    });

    test("rejects when line count changes", () => {
      const before = `const x = 1;`;
      const after = `const y = 1;\nconst z = 2;`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const renames = findings.filter((f) => f.rule === "safe/identifier-rename");
      expect(renames).toHaveLength(0);
    });

    test("rejects partial rename (not applied everywhere)", () => {
      const before = `const result = 1;\nfunction check(result) { return result; }\nexpect(check(result)).toBe(1);`;
      const after = `const output = 1;\nfunction check(result) { return result; }\nexpect(check(output)).toBe(1);`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      const renames = findings.filter((f) => f.rule === "safe/identifier-rename");
      expect(renames).toHaveLength(0);
    });

    test("allows rename of multiple variables consistently", () => {
      const before = `const foo = 1;\nconst bar = 2;\nexpect(foo + bar).toBe(3);`;
      const after = `const baz = 1;\nconst qux = 2;\nexpect(baz + qux).toBe(3);`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/identifier-rename");
    });
  });

  // --- Edge cases ---

  describe("edge cases", () => {
    test("returns no findings when non-test code is modified alongside tests", () => {
      const before = `
const helper = () => 1;

test('one', () => {
  expect(helper()).toBe(1);
});
`;
      const after = `
const helper = () => 2;

test('one', () => {
  expect(helper()).toBe(1);
});

test('two', () => {
  expect(2).toBe(2);
});
`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: after });
      expect(findings).toHaveLength(0);
    });

    test("handles whitespace-only before source as empty", () => {
      const after = `test('x', () => { expect(1).toBe(1); });`;
      const findings = classifySafeChanges({ beforeSource: "  \n  ", afterSource: after });
      expect(findings).toHaveLength(1);
      expect(findings[0].rule).toBe("safe/new-test-file");
    });

    test("handles whitespace-only after source as deleted", () => {
      const before = `test('x', () => { expect(1).toBe(1); });`;
      const findings = classifySafeChanges({ beforeSource: before, afterSource: "  \n  " });
      expect(findings).toHaveLength(0);
    });
  });
});
