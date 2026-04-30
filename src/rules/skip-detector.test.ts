import { describe, test, expect } from "bun:test";
import { detectSkipChanges } from "./skip-detector";
import { extractTestBlocksPair, extractTestBlocks } from "../test-block-extractor";
import { Severity } from "../types";
import { defineConfig } from "../config";

describe("detectSkipChanges", () => {
  test("detects it() → it.skip()", () => {
    const before = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.skip('works', () => {
  expect(1).toBe(1);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain(".skip");
    expect(findings[0].message).toContain("was disabled");
    expect(findings[0].rule).toBe("skip-detector");
  });

  test("detects it() → it.todo()", () => {
    const before = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.todo('works');
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain(".todo");
  });

  test("detects test() → test.skip()", () => {
    const before = `
test('adds numbers', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const after = `
test.skip('adds numbers', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].before).toBe('test("adds numbers")');
    expect(findings[0].after).toBe('test.skip("adds numbers")');
  });

  test("detects test() → test.skipIf()", () => {
    const before = `
test('slow test', () => {
  expect(result).toBe(42);
});
`;
    const after = `
test.skipIf(true)('slow test', () => {
  expect(result).toBe(42);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain(".skipIf");
  });

  test("detects describe.skip()", () => {
    const before = `
describe('suite', () => {
  test('inner', () => {
    expect(1).toBe(1);
  });
});
`;
    const after = `
describe.skip('suite', () => {
  test('inner', () => {
    expect(1).toBe(1);
  });
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("describe");
    expect(findings[0].message).toContain(".skip");
  });

  test("detects un-skipping (it.skip → it) as SAFE", () => {
    const before = `
it.skip('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SAFE);
    expect(findings[0].message).toContain("re-enabled");
  });

  test("detects un-todo (it.todo → it) as SAFE", () => {
    const before = `
it.todo('works');
`;
    const after = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SAFE);
    expect(findings[0].message).toContain("re-enabled");
    expect(findings[0].message).toContain(".todo");
  });

  test("no findings when skip state unchanged", () => {
    const before = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it('works', () => {
  expect(1).toBe(2);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(0);
  });

  test("no findings when already-skipped test stays skipped", () => {
    const before = `
it.skip('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.skip('works', () => {
  expect(1).toBe(2);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(0);
  });

  test("detects skip type change (.skip → .todo)", () => {
    const before = `
it.skip('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.todo('works');
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("changed from .skip to .todo");
  });

  test("new test added with .skip is flagged", () => {
    const before = `
it('existing', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it('existing', () => {
  expect(1).toBe(1);
});
it.skip('new broken', () => {
  expect(2).toBe(2);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("New");
    expect(findings[0].message).toContain(".skip");
  });

  test("new test added without skip is not flagged", () => {
    const before = `
it('existing', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it('existing', () => {
  expect(1).toBe(1);
});
it('brand new', () => {
  expect(2).toBe(2);
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(0);
  });

  test("respects custom severity from config", () => {
    const before = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.skip('works', () => {
  expect(1).toBe(1);
});
`;
    const config = defineConfig({
      rules: { skipAnnotation: Severity.SUSPICIOUS },
    });
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after, config);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.SUSPICIOUS);
  });

  test("respects custom todo severity from config", () => {
    const before = `
it('works', () => {
  expect(1).toBe(1);
});
`;
    const after = `
it.todo('works');
`;
    const config = defineConfig({
      rules: { todoAnnotation: Severity.LOW },
    });
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after, config);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.LOW);
  });

  test("handles multiple changes in one file", () => {
    const before = `
it('test-a', () => { expect(1).toBe(1); });
it('test-b', () => { expect(2).toBe(2); });
it.skip('test-c', () => { expect(3).toBe(3); });
`;
    const after = `
it.skip('test-a', () => { expect(1).toBe(1); });
it.todo('test-b');
it('test-c', () => { expect(3).toBe(3); });
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(3);

    const skipFinding = findings.find((f) => f.message.includes("test-a"));
    expect(skipFinding!.severity).toBe(Severity.CRITICAL);
    expect(skipFinding!.message).toContain(".skip");

    const todoFinding = findings.find((f) => f.message.includes("test-b"));
    expect(todoFinding!.severity).toBe(Severity.CRITICAL);
    expect(todoFinding!.message).toContain(".todo");

    const unskipFinding = findings.find((f) => f.message.includes("test-c"));
    expect(unskipFinding!.severity).toBe(Severity.SAFE);
    expect(unskipFinding!.message).toContain("re-enabled");
  });

  test("handles nested test blocks inside describe", () => {
    const before = `
describe('suite', () => {
  it('nested test', () => {
    expect(1).toBe(1);
  });
});
`;
    const after = `
describe('suite', () => {
  it.skip('nested test', () => {
    expect(1).toBe(1);
  });
});
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe(Severity.CRITICAL);
    expect(findings[0].message).toContain("nested test");
  });

  test("reports correct line number", () => {
    const before = `
it('first', () => { expect(1).toBe(1); });
it('second', () => { expect(2).toBe(2); });
`;
    const after = `
it('first', () => { expect(1).toBe(1); });
it.skip('second', () => { expect(2).toBe(2); });
`;
    const pair = extractTestBlocksPair(before, after);
    const findings = detectSkipChanges(pair.before, pair.after);

    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(3);
  });

  test("empty before and after produces no findings", () => {
    const findings = detectSkipChanges([], []);
    expect(findings).toHaveLength(0);
  });
});
