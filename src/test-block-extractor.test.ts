import { describe, test, expect } from "bun:test";
import { extractTestBlocks, extractTestBlocksPair } from "./test-block-extractor";

describe("extractTestBlocks", () => {
  test("extracts a simple test block", () => {
    const source = `
test('adds numbers', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("test");
    expect(blocks[0].name).toBe("adds numbers");
    expect(blocks[0].skip).toBe(false);
    expect(blocks[0].todo).toBe(false);
    expect(blocks[0].skipIf).toBe(false);
    expect(blocks[0].assertions).toHaveLength(1);
    expect(blocks[0].assertions[0].matcher).toBe("toBe");
  });

  test("extracts it() blocks", () => {
    const source = `
it('should work', () => {
  expect(result).toBeDefined();
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("it");
    expect(blocks[0].name).toBe("should work");
    expect(blocks[0].assertions[0].matcher).toBe("toBeDefined");
  });

  test("extracts describe blocks with nested tests", () => {
    const source = `
describe('math', () => {
  test('adds', () => {
    expect(add(1, 2)).toBe(3);
  });
  test('subtracts', () => {
    expect(sub(3, 1)).toBe(2);
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("describe");
    expect(blocks[0].name).toBe("math");
    expect(blocks[0].children).toHaveLength(2);
    expect(blocks[0].children[0].name).toBe("adds");
    expect(blocks[0].children[1].name).toBe("subtracts");
    expect(blocks[0].assertions).toHaveLength(0);
  });

  test("detects skip annotation", () => {
    const source = `
it.skip('broken test', () => {
  expect(true).toBe(false);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].skip).toBe(true);
    expect(blocks[0].todo).toBe(false);
  });

  test("detects todo annotation", () => {
    const source = `
it.todo('future test');
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].todo).toBe(true);
    expect(blocks[0].name).toBe("future test");
  });

  test("detects skipIf annotation", () => {
    const source = `
it.skipIf(process.env.CI)('slow test', () => {
  expect(result).toBe(42);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].skipIf).toBe(true);
    expect(blocks[0].name).toBe("slow test");
  });

  test("captures negated matchers", () => {
    const source = `
test('not equal', () => {
  expect(a).not.toBe(b);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions[0].matcher).toBe("not.toBe");
  });

  test("captures multiple assertions", () => {
    const source = `
test('multiple checks', () => {
  expect(result).toBeDefined();
  expect(result.name).toBe('test');
  expect(result.items).toHaveLength(3);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(3);
    expect(blocks[0].assertions[0].matcher).toBe("toBeDefined");
    expect(blocks[0].assertions[1].matcher).toBe("toBe");
    expect(blocks[0].assertions[2].matcher).toBe("toHaveLength");
  });

  test("captures line ranges", () => {
    const source = `test('one', () => {
  expect(1).toBe(1);
});
test('two', () => {
  expect(2).toBe(2);
});`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[0].endLine).toBe(3);
    expect(blocks[1].startLine).toBe(4);
    expect(blocks[1].endLine).toBe(6);
  });

  test("captures body source", () => {
    const source = `
test('has body', () => {
  const x = 1;
  expect(x).toBe(1);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].body).toContain("const x = 1");
    expect(blocks[0].body).toContain("expect(x).toBe(1)");
  });

  test("handles describe.skip", () => {
    const source = `
describe.skip('disabled suite', () => {
  test('inner', () => {
    expect(true).toBe(true);
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].skip).toBe(true);
    expect(blocks[0].children).toHaveLength(1);
  });

  test("handles resolves/rejects chains", () => {
    const source = `
test('async', async () => {
  await expect(promise).resolves.toBe(42);
  await expect(badPromise).rejects.toThrow('error');
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(2);
    expect(blocks[0].assertions[0].matcher).toBe("resolves.toBe");
    expect(blocks[0].assertions[1].matcher).toBe("rejects.toThrow");
  });

  test("handles nested describes", () => {
    const source = `
describe('outer', () => {
  describe('inner', () => {
    test('deep', () => {
      expect(1).toBe(1);
    });
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].children).toHaveLength(1);
    expect(blocks[0].children[0].type).toBe("describe");
    expect(blocks[0].children[0].children).toHaveLength(1);
    expect(blocks[0].children[0].children[0].name).toBe("deep");
  });

  test("handles empty test file", () => {
    const blocks = extractTestBlocks("");
    expect(blocks).toHaveLength(0);
  });

  test("handles file with imports only", () => {
    const source = `
import { describe, test, expect } from 'bun:test';
import { add } from './math';
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(0);
  });
});

describe("extractTestBlocksPair", () => {
  test("returns before and after blocks", () => {
    const before = `
test('adds', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const after = `
test.skip('adds', () => {
  expect(add(1, 2)).toBe(3);
});
`;
    const result = extractTestBlocksPair(before, after);
    expect(result.before).toHaveLength(1);
    expect(result.after).toHaveLength(1);
    expect(result.before[0].skip).toBe(false);
    expect(result.after[0].skip).toBe(true);
  });

  test("detects assertion removal", () => {
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
    const result = extractTestBlocksPair(before, after);
    expect(result.before[0].assertions).toHaveLength(3);
    expect(result.after[0].assertions).toHaveLength(1);
  });

  test("detects test deletion", () => {
    const before = `
test('one', () => { expect(1).toBe(1); });
test('two', () => { expect(2).toBe(2); });
`;
    const after = `
test('one', () => { expect(1).toBe(1); });
`;
    const result = extractTestBlocksPair(before, after);
    expect(result.before).toHaveLength(2);
    expect(result.after).toHaveLength(1);
  });
});
