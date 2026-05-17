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

  test("handles 3-level nested describes with assertions at leaf", () => {
    const source = `
describe('api', () => {
  describe('auth', () => {
    describe('login', () => {
      test('validates email', () => {
        expect(validate("test@example.com")).toBe(true);
      });
      test('rejects invalid', () => {
        expect(validate("bad")).toBe(false);
      });
    });
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("describe");
    expect(blocks[0].name).toBe("api");
    expect(blocks[0].children).toHaveLength(1);

    const auth = blocks[0].children[0];
    expect(auth.type).toBe("describe");
    expect(auth.name).toBe("auth");
    expect(auth.children).toHaveLength(1);

    const login = auth.children[0];
    expect(login.type).toBe("describe");
    expect(login.name).toBe("login");
    expect(login.children).toHaveLength(2);
    expect(login.children[0].name).toBe("validates email");
    expect(login.children[0].assertions).toHaveLength(1);
    expect(login.children[1].name).toBe("rejects invalid");
    expect(login.children[1].assertions).toHaveLength(1);
  });

  test("handles mixed nesting: tests at multiple levels", () => {
    const source = `
describe('suite', () => {
  test('top-level test', () => {
    expect(1).toBe(1);
  });
  describe('nested', () => {
    test('nested test', () => {
      expect(2).toBe(2);
    });
    describe('deeply nested', () => {
      test('deep test', () => {
        expect(3).toBe(3);
      });
    });
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    const suite = blocks[0];
    expect(suite.children).toHaveLength(2);
    expect(suite.children[0].type).toBe("test");
    expect(suite.children[0].name).toBe("top-level test");
    expect(suite.children[1].type).toBe("describe");
    expect(suite.children[1].children).toHaveLength(2);
    expect(suite.children[1].children[0].type).toBe("test");
    expect(suite.children[1].children[1].type).toBe("describe");
    expect(suite.children[1].children[1].children).toHaveLength(1);
    expect(suite.children[1].children[1].children[0].name).toBe("deep test");
  });

  test("handles nested describe with skip at parent level", () => {
    const source = `
describe.skip('disabled suite', () => {
  describe('inner', () => {
    test('should not run', () => {
      expect(1).toBe(1);
    });
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].skip).toBe(true);
    expect(blocks[0].children).toHaveLength(1);
    expect(blocks[0].children[0].type).toBe("describe");
    expect(blocks[0].children[0].children).toHaveLength(1);
  });

  test("handles non-ASCII test names", () => {
    const source = `
describe('国際化', () => {
  test('日本語テスト', () => {
    expect(translate("hello")).toBe("こんにちは");
  });
  test('Ünïcödé characters: àéîõü', () => {
    expect(normalize("café")).toBe("cafe");
  });
  test('emoji test 🎉', () => {
    expect(getEmoji()).toBe("👋");
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("国際化");
    expect(blocks[0].children).toHaveLength(3);
    expect(blocks[0].children[0].name).toBe("日本語テスト");
    expect(blocks[0].children[1].name).toBe("Ünïcödé characters: àéîõü");
    expect(blocks[0].children[2].name).toBe("emoji test 🎉");
  });

  test("handles multi-line assertion chains", () => {
    const source = `
test('complex assertions', () => {
  expect(result)
    .not
    .toBe(null);
  expect(data).toEqual({
    id: 1,
    name: "test",
    nested: { a: true }
  });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].assertions).toHaveLength(2);
    expect(blocks[0].assertions[0].matcher).toBe("not.toBe");
    expect(blocks[0].assertions[1].matcher).toBe("toEqual");
  });

  test("handles resolves.not chain", () => {
    const source = `
test('async negation', async () => {
  await expect(asyncFn()).resolves.not.toBe(null);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(1);
    expect(blocks[0].assertions[0].matcher).toBe("resolves.not.toBe");
  });

  test("extracts assert.equal as assertion", () => {
    const source = `
test('uses node:assert', () => {
  const result = add(1, 2);
  assert.equal(result, 3);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].assertions).toHaveLength(1);
    expect(blocks[0].assertions[0].matcher).toBe("assert.equal");
  });

  test("extracts multiple node:assert methods", () => {
    const source = `
test('multiple assert calls', () => {
  assert.ok(result);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { id: 1 });
  assert.match(result.message, /success/);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(4);
    expect(blocks[0].assertions[0].matcher).toBe("assert.ok");
    expect(blocks[0].assertions[1].matcher).toBe("assert.equal");
    expect(blocks[0].assertions[2].matcher).toBe("assert.deepEqual");
    expect(blocks[0].assertions[3].matcher).toBe("assert.match");
  });

  test("extracts bare assert() call", () => {
    const source = `
test('bare assert', () => {
  assert(value !== null);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(1);
    expect(blocks[0].assertions[0].matcher).toBe("assert");
  });

  test("extracts mixed expect and assert assertions", () => {
    const source = `
test('mixed assertions', () => {
  expect(a).toBe(1);
  assert.equal(b, 2);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(2);
    expect(blocks[0].assertions[0].matcher).toBe("toBe");
    expect(blocks[0].assertions[1].matcher).toBe("assert.equal");
  });

  test("extracts assert.strictEqual and assert.throws", () => {
    const source = `
test('strict and throws', () => {
  assert.strictEqual(result, 42);
  assert.throws(() => badFn(), /error/);
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks[0].assertions).toHaveLength(2);
    expect(blocks[0].assertions[0].matcher).toBe("assert.strictEqual");
    expect(blocks[0].assertions[1].matcher).toBe("assert.throws");
  });

  test("handles multiple sibling describes", () => {
    const source = `
describe('module A', () => {
  test('a1', () => { expect(1).toBe(1); });
});
describe('module B', () => {
  test('b1', () => { expect(2).toBe(2); });
});
describe('module C', () => {
  test('c1', () => { expect(3).toBe(3); });
});
`;
    const blocks = extractTestBlocks(source);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].name).toBe("module A");
    expect(blocks[1].name).toBe("module B");
    expect(blocks[2].name).toBe("module C");
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
