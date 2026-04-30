import { describe, test, expect } from "bun:test";
import { parseAssertionParts, detectValueChanges } from "./value-change-detector";
import { extractTestBlocksPair } from "../test-block-extractor";
import { Severity } from "../types";

function detect(beforeSource: string, afterSource: string) {
  const { before, after } = extractTestBlocksPair(beforeSource, afterSource);
  return detectValueChanges(before, after);
}

describe("parseAssertionParts", () => {
  test("simple toBe", () => {
    expect(parseAssertionParts("expect(result).toBe(42)")).toEqual({
      subject: "result",
      matcher: "toBe",
      expectedArgs: "42",
    });
  });

  test("function call as subject", () => {
    expect(parseAssertionParts("expect(calculateTax(100)).toBe(19)")).toEqual({
      subject: "calculateTax(100)",
      matcher: "toBe",
      expectedArgs: "19",
    });
  });

  test("toEqual with object literal", () => {
    const result = parseAssertionParts('expect(obj).toEqual({ a: 1, b: "x" })');
    expect(result).toEqual({
      subject: "obj",
      matcher: "toEqual",
      expectedArgs: '{ a: 1, b: "x" }',
    });
  });

  test("not.toBe chain", () => {
    expect(parseAssertionParts("expect(x).not.toBe(false)")).toEqual({
      subject: "x",
      matcher: "not.toBe",
      expectedArgs: "false",
    });
  });

  test("resolves chain", () => {
    expect(parseAssertionParts("expect(promise).resolves.toBe(42)")).toEqual({
      subject: "promise",
      matcher: "resolves.toBe",
      expectedArgs: "42",
    });
  });

  test("matcher with no args", () => {
    expect(parseAssertionParts("expect(x).toBeDefined()")).toEqual({
      subject: "x",
      matcher: "toBeDefined",
      expectedArgs: "",
    });
  });

  test("toHaveLength", () => {
    expect(parseAssertionParts("expect(arr).toHaveLength(5)")).toEqual({
      subject: "arr",
      matcher: "toHaveLength",
      expectedArgs: "5",
    });
  });

  test("string expected value", () => {
    expect(parseAssertionParts('expect(name).toBe("Alice")')).toEqual({
      subject: "name",
      matcher: "toBe",
      expectedArgs: '"Alice"',
    });
  });

  test("multiple matcher arguments", () => {
    expect(parseAssertionParts("expect(fn).toHaveBeenCalledWith(1, 2, 3)")).toEqual({
      subject: "fn",
      matcher: "toHaveBeenCalledWith",
      expectedArgs: "1, 2, 3",
    });
  });

  test("returns null for non-expect expression", () => {
    expect(parseAssertionParts("console.log(42)")).toBeNull();
  });

  test("returns null for plain function call", () => {
    expect(parseAssertionParts("doSomething()")).toBeNull();
  });
});

describe("detectValueChanges", () => {
  test("detects toBe value change (concept doc line 25)", () => {
    const before = `test("calculates tax", () => {
      expect(calculateTax(100)).toBe(19);
    });`;
    const after = `test("calculates tax", () => {
      expect(calculateTax(100)).toBe(0);
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe("value-change");
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
    expect(findings[0].message).toContain("19");
    expect(findings[0].message).toContain("0");
    expect(findings[0].message).toContain("calculateTax(100)");
    expect(findings[0].before).toContain("toBe(19)");
    expect(findings[0].after).toContain("toBe(0)");
  });

  test("no findings when values unchanged", () => {
    const src = `test("x", () => { expect(a).toBe(1); });`;
    expect(detect(src, src)).toEqual([]);
  });

  test("no findings for new test", () => {
    const before = `test("existing", () => { expect(1).toBe(1); });`;
    const after = `test("existing", () => { expect(1).toBe(1); });
    test("new", () => { expect(calculateTax(100)).toBe(0); });`;
    expect(detect(before, after)).toEqual([]);
  });

  test("no findings for removed test", () => {
    const before = `test("old", () => { expect(calculateTax(100)).toBe(19); });
    test("kept", () => { expect(1).toBe(1); });`;
    const after = `test("kept", () => { expect(1).toBe(1); });`;
    expect(detect(before, after)).toEqual([]);
  });

  test("no findings when subject changes", () => {
    const before = `test("math", () => { expect(add(1, 2)).toBe(3); });`;
    const after = `test("math", () => { expect(add(2, 3)).toBe(5); });`;
    expect(detect(before, after)).toEqual([]);
  });

  test("no findings when matcher changes", () => {
    const before = `test("x", () => { expect(result).toBe(42); });`;
    const after = `test("x", () => { expect(result).toEqual(42); });`;
    expect(detect(before, after)).toEqual([]);
  });

  test("detects toEqual value change", () => {
    const before = `test("config", () => {
      expect(getConfig()).toEqual({ port: 3000 });
    });`;
    const after = `test("config", () => {
      expect(getConfig()).toEqual({ port: 8080 });
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("{ port: 3000 }");
    expect(findings[0].message).toContain("{ port: 8080 }");
  });

  test("detects toHaveLength value change", () => {
    const before = `test("items", () => { expect(getItems()).toHaveLength(3); });`;
    const after = `test("items", () => { expect(getItems()).toHaveLength(0); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
  });

  test("handles nested describe blocks", () => {
    const before = `describe("Calculator", () => {
      describe("tax", () => {
        test("calculates tax", () => {
          expect(calculateTax(100)).toBe(19);
        });
      });
    });`;
    const after = `describe("Calculator", () => {
      describe("tax", () => {
        test("calculates tax", () => {
          expect(calculateTax(100)).toBe(0);
        });
      });
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
  });

  test("detects multiple value changes in one test", () => {
    const before = `test("calculations", () => {
      expect(add(1, 2)).toBe(3);
      expect(multiply(2, 3)).toBe(6);
    });`;
    const after = `test("calculations", () => {
      expect(add(1, 2)).toBe(0);
      expect(multiply(2, 3)).toBe(0);
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(2);
  });

  test("ignores matchers without arguments", () => {
    const src = `test("x", () => { expect(result).toBeDefined(); });`;
    expect(detect(src, src)).toEqual([]);
  });

  test("detects string literal value change", () => {
    const before = `test("greeting", () => {
      expect(greet("world")).toBe("Hello, world!");
    });`;
    const after = `test("greeting", () => {
      expect(greet("world")).toBe("Hi");
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
  });

  test("captures old and new values in finding fields", () => {
    const before = `test("price", () => {
      expect(getPrice()).toBe(99.99);
    });`;
    const after = `test("price", () => {
      expect(getPrice()).toBe(0);
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].before).toContain("toBe(99.99)");
    expect(findings[0].after).toContain("toBe(0)");
    expect(findings[0].message).toContain("99.99");
    expect(findings[0].message).toContain("0");
  });

  test("does not flag when only assertion is added alongside existing", () => {
    const before = `test("x", () => { expect(a).toBe(1); });`;
    const after = `test("x", () => {
      expect(a).toBe(1);
      expect(b).toBe(2);
    });`;
    expect(detect(before, after)).toEqual([]);
  });

  test("matches by subject+matcher, not position", () => {
    const before = `test("x", () => {
      expect(a).toBe(1);
      expect(b).toBe(2);
    });`;
    const after = `test("x", () => {
      expect(b).toBe(99);
      expect(a).toBe(1);
    });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2");
    expect(findings[0].message).toContain("99");
  });

  test("detects value change with not.toBe", () => {
    const before = `test("x", () => { expect(x).not.toBe(42); });`;
    const after = `test("x", () => { expect(x).not.toBe(0); });`;
    const findings = detect(before, after);
    expect(findings).toHaveLength(1);
  });

  test("empty before source produces no findings", () => {
    expect(detect("", `test("x", () => { expect(a).toBe(1); });`)).toEqual([]);
  });

  test("empty after source produces no findings", () => {
    expect(detect(`test("x", () => { expect(a).toBe(1); });`, "")).toEqual([]);
  });
});
