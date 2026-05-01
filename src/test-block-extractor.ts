import { Project, type SourceFile, type CallExpression, SyntaxKind, type Node } from "ts-morph";

export interface Assertion {
  matcher: string;
  line: number;
  text: string;
}

export interface TestBlock {
  type: "describe" | "it" | "test";
  name: string;
  startLine: number;
  endLine: number;
  assertions: Assertion[];
  skip: boolean;
  todo: boolean;
  skipIf: boolean;
  body: string;
  children: TestBlock[];
}

const TEST_CALL_NAMES = new Set(["it", "test", "describe"]);

export function extractTestBlocks(source: string, filePath = "virtual.test.ts"): TestBlock[] {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { allowJs: true } });
  const sourceFile = project.createSourceFile(filePath, source);
  return extractFromNode(sourceFile);
}

export function extractTestBlocksPair(
  beforeSource: string,
  afterSource: string,
  filePath = "virtual.test.ts",
): { before: TestBlock[]; after: TestBlock[] } {
  return {
    before: extractTestBlocks(beforeSource, filePath),
    after: extractTestBlocks(afterSource, filePath),
  };
}

function extractFromNode(node: SourceFile | Node): TestBlock[] {
  const blocks: TestBlock[] = [];
  const searchRoot = getFunctionBody(node) ?? node;

  for (const call of findTestCalls(searchRoot)) {
    const block = parseTestCall(call);
    if (block) blocks.push(block);
  }

  return blocks;
}

function getFunctionBody(node: Node): Node | null {
  if (node.isKind(SyntaxKind.ArrowFunction) || node.isKind(SyntaxKind.FunctionExpression)) {
    return node.getBody();
  }
  return null;
}

function findTestCalls(node: SourceFile | Node): CallExpression[] {
  const results: CallExpression[] = [];
  node.forEachChild((child) => {
    if (child.isKind(SyntaxKind.ExpressionStatement)) {
      const expr = child.getExpression();
      if (expr.isKind(SyntaxKind.CallExpression) && isTestCall(expr)) {
        results.push(expr);
      }
    }
  });
  return results;
}

function isTestCall(call: CallExpression): boolean {
  const { name } = resolveCallInfo(call);
  return TEST_CALL_NAMES.has(name);
}

interface CallInfo {
  name: string;
  skip: boolean;
  todo: boolean;
  skipIf: boolean;
}

function resolveCallInfo(call: CallExpression): CallInfo {
  const info: CallInfo = { name: "", skip: false, todo: false, skipIf: false };
  const expr = call.getExpression();

  if (expr.isKind(SyntaxKind.Identifier)) {
    info.name = expr.getText();
    return info;
  }

  if (expr.isKind(SyntaxKind.CallExpression)) {
    const innerExpr = expr.getExpression();
    if (innerExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const prop = innerExpr.getName();
      const obj = innerExpr.getExpression();

      // e.g. it.each([...])(...), it.skipIf(condition)(...), describe.each(...)()
      if (obj.isKind(SyntaxKind.Identifier) && TEST_CALL_NAMES.has(obj.getText())) {
        info.name = obj.getText();
        if (prop === "skipIf") info.skipIf = true;
        return info;
      }

      // e.g. it.skip.each([...])(...), describe.concurrent.each(...)()
      if (obj.isKind(SyntaxKind.PropertyAccessExpression)) {
        const innerProp = obj.getName();
        const innerObj = obj.getExpression();
        if (innerObj.isKind(SyntaxKind.Identifier) && TEST_CALL_NAMES.has(innerObj.getText())) {
          info.name = innerObj.getText();
          if (innerProp === "skip" || prop === "skip") info.skip = true;
          if (innerProp === "todo" || prop === "todo") info.todo = true;
          if (innerProp === "skipIf") info.skipIf = true;
          return info;
        }
      }
    }
  }

  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    const prop = expr.getName();
    const obj = expr.getExpression();

    if (obj.isKind(SyntaxKind.Identifier) && TEST_CALL_NAMES.has(obj.getText())) {
      info.name = obj.getText();
      if (prop === "skip") info.skip = true;
      else if (prop === "todo") info.todo = true;
      else if (prop === "only") { /* treated as normal */ }
      return info;
    }

    // e.g. describe.skip.each(...)
    if (obj.isKind(SyntaxKind.PropertyAccessExpression)) {
      const innerProp = obj.getName();
      const innerObj = obj.getExpression();
      if (innerObj.isKind(SyntaxKind.Identifier) && TEST_CALL_NAMES.has(innerObj.getText())) {
        info.name = innerObj.getText();
        if (innerProp === "skip" || prop === "skip") info.skip = true;
        if (innerProp === "todo" || prop === "todo") info.todo = true;
        return info;
      }
    }
  }

  return info;
}

function parseTestCall(call: CallExpression): TestBlock | null {
  const { name, skip, todo, skipIf } = resolveCallInfo(call);
  if (!TEST_CALL_NAMES.has(name)) return null;

  const args = call.getArguments();
  if (args.length < 2) {
    if (todo && args.length >= 1) {
      const nameArg = args[0];
      const testName = extractStringLiteral(nameArg);
      const stmt = call.getParent();
      if (!stmt) return null;
      return {
        type: name as TestBlock["type"],
        name: testName,
        startLine: stmt.getStartLineNumber(),
        endLine: stmt.getEndLineNumber(),
        assertions: [],
        skip,
        todo,
        skipIf,
        body: "",
        children: [],
      };
    }
    return null;
  }

  const nameArg = args[0];
  const bodyArg = args[1];
  const testName = extractStringLiteral(nameArg);
  const stmt = call.getParent();
  if (!stmt) return null;

  const type = name as TestBlock["type"];
  const assertions = type === "describe" ? [] : collectAssertions(bodyArg);
  const children = type === "describe" ? extractFromNode(bodyArg) : [];

  const bodyText = bodyArg.isKind(SyntaxKind.ArrowFunction) || bodyArg.isKind(SyntaxKind.FunctionExpression)
    ? bodyArg.getText()
    : bodyArg.getText();

  return {
    type,
    name: testName,
    startLine: stmt.getStartLineNumber(),
    endLine: stmt.getEndLineNumber(),
    assertions,
    skip,
    todo,
    skipIf,
    body: bodyText,
    children,
  };
}

function extractStringLiteral(node: Node): string {
  if (node.isKind(SyntaxKind.StringLiteral)) {
    return node.getLiteralText();
  }
  if (node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return node.getLiteralText();
  }
  if (node.isKind(SyntaxKind.TemplateExpression)) {
    return node.getText();
  }
  return node.getText();
}

function collectAssertions(node: Node): Assertion[] {
  const assertions: Assertion[] = [];

  node.forEachDescendant((descendant) => {
    if (!descendant.isKind(SyntaxKind.CallExpression)) return;

    const matcher = resolveExpectChain(descendant);
    if (matcher) {
      assertions.push({
        matcher,
        line: descendant.getStartLineNumber(),
        text: descendant.getText(),
      });
    }
  });

  return assertions;
}

function resolveExpectChain(call: CallExpression): string | null {
  const expr = call.getExpression();

  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = expr.getName();
    const obj = expr.getExpression();

    // expect(...).toBe(...)
    if (isExpectCall(obj)) {
      return propName;
    }

    // expect(...).not.toBe(...)
    if (obj.isKind(SyntaxKind.PropertyAccessExpression) && obj.getName() === "not") {
      if (isExpectCall(obj.getExpression())) {
        return `not.${propName}`;
      }
    }

    // expect(...).resolves.toBe(...) / expect(...).rejects.toBe(...)
    if (obj.isKind(SyntaxKind.PropertyAccessExpression)) {
      const midProp = obj.getName();
      if ((midProp === "resolves" || midProp === "rejects") && isExpectCall(obj.getExpression())) {
        return `${midProp}.${propName}`;
      }

      // expect(...).resolves.not.toBe(...)
      if (midProp === "not") {
        const inner = obj.getExpression();
        if (inner.isKind(SyntaxKind.PropertyAccessExpression)) {
          const innerProp = inner.getName();
          if ((innerProp === "resolves" || innerProp === "rejects") && isExpectCall(inner.getExpression())) {
            return `${innerProp}.not.${propName}`;
          }
        }
      }
    }
  }

  return null;
}

function isExpectCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) return false;
  const expr = node.getExpression();
  return expr.isKind(SyntaxKind.Identifier) && expr.getText() === "expect";
}
