import { Project, SyntaxKind, type Node, type CallExpression, type SourceFile } from "ts-morph";
import { type Finding, Severity } from "../types";

export interface TautologyConfig {
  severity: Severity;
}

const DEFAULT_CONFIG: TautologyConfig = { severity: Severity.CRITICAL };

export function detectTautologies(
  source: string,
  filePath = "virtual.test.ts",
  config: TautologyConfig = DEFAULT_CONFIG,
): Finding[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true },
  });
  const sourceFile = project.createSourceFile(filePath, source);
  const findings: Finding[] = [];

  const testBlocks = collectTestBlocks(sourceFile);

  for (const block of testBlocks) {
    findings.push(...checkLiteralAssertions(block, config.severity));
    findings.push(...checkSameIdentifierAssertions(block, config.severity));
    findings.push(...checkNoAssertions(block, config.severity));
  }

  findings.push(...checkTruthyMocks(sourceFile, config.severity));

  return findings;
}

interface TestBlockInfo {
  name: string;
  bodyNode: Node;
  startLine: number;
}

const TEST_NAMES = new Set(["it", "test"]);

function collectTestBlocks(sourceFile: SourceFile): TestBlockInfo[] {
  const blocks: TestBlockInfo[] = [];
  visitNode(sourceFile, blocks);
  return blocks;
}

function visitNode(node: Node, blocks: TestBlockInfo[]) {
  node.forEachDescendant((descendant) => {
    if (!descendant.isKind(SyntaxKind.CallExpression)) return;
    const info = parseTestCallSite(descendant as CallExpression);
    if (info) blocks.push(info);
  });
}

function parseTestCallSite(call: CallExpression): TestBlockInfo | null {
  const name = resolveTestCallName(call);
  if (!name || !TEST_NAMES.has(name)) return null;

  const args = call.getArguments();
  if (args.length < 2) return null;

  const nameArg = args[0];
  const bodyArg = args[1];

  const testName = nameArg.isKind(SyntaxKind.StringLiteral)
    ? nameArg.getLiteralText()
    : nameArg.getText();

  return {
    name: testName,
    bodyNode: bodyArg,
    startLine: call.getStartLineNumber(),
  };
}

function resolveTestCallName(call: CallExpression): string | null {
  const expr = call.getExpression();

  if (expr.isKind(SyntaxKind.Identifier)) {
    return expr.getText();
  }

  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    const obj = expr.getExpression();
    if (obj.isKind(SyntaxKind.Identifier) && TEST_NAMES.has(obj.getText())) {
      return obj.getText();
    }
  }

  if (expr.isKind(SyntaxKind.CallExpression)) {
    const innerExpr = expr.getExpression();
    if (innerExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const obj = innerExpr.getExpression();
      if (obj.isKind(SyntaxKind.Identifier) && TEST_NAMES.has(obj.getText())) {
        return obj.getText();
      }
    }
  }

  return null;
}

function checkLiteralAssertions(block: TestBlockInfo, severity: Severity): Finding[] {
  const findings: Finding[] = [];

  block.bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;

    const expectArg = getExpectArgument(call);
    if (!expectArg) return;

    const matcherArg = call.getArguments()[0];
    if (!matcherArg) return;

    if (!isLiteral(expectArg) || !isLiteral(matcherArg)) return;

    const expectText = expectArg.getText();
    const matcherText = matcherArg.getText();

    if (expectText === matcherText) {
      findings.push({
        rule: "tautology/literal-match",
        severity,
        line: call.getStartLineNumber(),
        message: `Tautological assertion: both sides are the same literal \`${expectText}\``,
        before: call.getText(),
        after: "",
      });
    } else if (isLiteral(expectArg) && isLiteral(matcherArg)) {
      findings.push({
        rule: "tautology/literal-both-sides",
        severity,
        line: call.getStartLineNumber(),
        message: `Both sides of assertion are literals: expect(${expectText}).…(${matcherText})`,
        before: call.getText(),
        after: "",
      });
    }
  });

  return findings;
}

function checkSameIdentifierAssertions(block: TestBlockInfo, severity: Severity): Finding[] {
  const findings: Finding[] = [];

  block.bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;

    const expectArg = getExpectArgument(call);
    if (!expectArg) return;

    const matcherArg = call.getArguments()[0];
    if (!matcherArg) return;

    if (isLiteral(expectArg) || isLiteral(matcherArg)) return;

    const expectText = expectArg.getText().trim();
    const matcherText = matcherArg.getText().trim();

    if (expectText === matcherText && expectText.length > 0) {
      findings.push({
        rule: "tautology/same-identifier",
        severity,
        line: call.getStartLineNumber(),
        message: `Tautological assertion: expect(${expectText}).…(${expectText}) — same expression on both sides`,
        before: call.getText(),
        after: "",
      });
    }
  });

  return findings;
}

const NODE_ASSERT_METHODS = new Set([
  "ok",
  "equal",
  "notEqual",
  "strictEqual",
  "notStrictEqual",
  "deepEqual",
  "notDeepEqual",
  "deepStrictEqual",
  "notDeepStrictEqual",
  "match",
  "doesNotMatch",
  "throws",
  "doesNotThrow",
  "rejects",
  "doesNotReject",
  "fail",
  "ifError",
]);

function isNodeAssertCall(call: CallExpression): boolean {
  const expr = call.getExpression();

  if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
    const methodName = expr.getName();
    const obj = expr.getExpression();
    if (
      obj.isKind(SyntaxKind.Identifier) &&
      obj.getText() === "assert" &&
      NODE_ASSERT_METHODS.has(methodName)
    ) {
      return true;
    }
  }

  if (expr.isKind(SyntaxKind.Identifier) && expr.getText() === "assert") {
    return true;
  }

  return false;
}

function checkNoAssertions(block: TestBlockInfo, severity: Severity): Finding[] {
  let hasAssertion = false;

  block.bodyNode.forEachDescendant((node) => {
    if (hasAssertion) return;
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;
    const expr = call.getExpression();

    if (isExpectCall(call)) {
      hasAssertion = true;
      return;
    }

    if (isNodeAssertCall(call)) {
      hasAssertion = true;
      return;
    }

    if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const obj = expr.getExpression();
      if (isExpectCall(obj)) {
        hasAssertion = true;
        return;
      }
      if (obj.isKind(SyntaxKind.PropertyAccessExpression) && isExpectCall(obj.getExpression())) {
        hasAssertion = true;
        return;
      }
    }
  });

  if (hasAssertion) return [];

  return [
    {
      rule: "tautology/no-assertions",
      severity,
      line: block.startLine,
      message: `Test "${block.name}" has no assertion calls`,
      before: "",
      after: "",
    },
  ];
}

function checkTruthyMocks(sourceFile: SourceFile, severity: Severity): Finding[] {
  const findings: Finding[] = [];

  sourceFile.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;
    const expr = call.getExpression();

    if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return;
    const methodName = expr.getName();

    if (methodName !== "mockReturnValue" && methodName !== "mockResolvedValue") return;

    const args = call.getArguments();
    if (args.length !== 1) return;

    const arg = args[0];
    if (!isAlwaysTruthy(arg)) return;

    const mockChainRoot = findMockChainRoot(expr.getExpression());
    if (!mockChainRoot) return;

    if (!hasNonTrivialSignature(sourceFile, mockChainRoot)) return;

    findings.push({
      rule: "tautology/truthy-mock",
      severity,
      line: call.getStartLineNumber(),
      message: `Mock ${methodName}(${arg.getText()}) always returns truthy for non-trivial signature`,
      before: call.getText(),
      after: "",
    });
  });

  return findings;
}

function getExpectArgument(call: CallExpression): Node | null {
  const expr = call.getExpression();
  if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return null;

  let current: Node = expr.getExpression();

  // Walk through .not, .resolves, .rejects chains
  while (current.isKind(SyntaxKind.PropertyAccessExpression)) {
    const propName = current.getName();
    if (propName === "not" || propName === "resolves" || propName === "rejects") {
      current = current.getExpression();
    } else {
      break;
    }
  }

  if (!current.isKind(SyntaxKind.CallExpression)) return null;
  const innerExpr = current.getExpression();
  if (!innerExpr.isKind(SyntaxKind.Identifier) || innerExpr.getText() !== "expect") return null;

  const expectArgs = current.getArguments();
  return expectArgs.length > 0 ? expectArgs[0] : null;
}

function isExpectCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) return false;
  const expr = (node as CallExpression).getExpression();
  return expr.isKind(SyntaxKind.Identifier) && expr.getText() === "expect";
}

function isLiteral(node: Node): boolean {
  if (node.isKind(SyntaxKind.StringLiteral)) return true;
  if (node.isKind(SyntaxKind.NumericLiteral)) return true;
  if (node.isKind(SyntaxKind.TrueKeyword)) return true;
  if (node.isKind(SyntaxKind.FalseKeyword)) return true;
  if (node.isKind(SyntaxKind.NullKeyword)) return true;
  if (node.isKind(SyntaxKind.UndefinedKeyword)) return true;

  if (node.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operand = node.getOperand();
    const op = node.getOperatorToken();
    if (op === SyntaxKind.MinusToken && operand.isKind(SyntaxKind.NumericLiteral)) return true;
  }

  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return node.getElements().every((el) => isLiteral(el));
  }

  if (node.isKind(SyntaxKind.ObjectLiteralExpression)) {
    return node.getProperties().every((prop) => {
      if (prop.isKind(SyntaxKind.PropertyAssignment)) {
        const init = prop.getInitializer();
        return init ? isLiteral(init) : false;
      }
      return false;
    });
  }

  return false;
}

function isAlwaysTruthy(node: Node): boolean {
  if (node.isKind(SyntaxKind.TrueKeyword)) return true;
  if (node.isKind(SyntaxKind.NumericLiteral)) {
    const val = Number(node.getText());
    return val !== 0 && !Number.isNaN(val);
  }
  if (node.isKind(SyntaxKind.StringLiteral)) {
    return node.getLiteralText().length > 0;
  }
  if (node.isKind(SyntaxKind.ObjectLiteralExpression)) return true;
  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) return true;
  return false;
}

function findMockChainRoot(node: Node): string | null {
  if (node.isKind(SyntaxKind.Identifier)) return node.getText();
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    return node.getText();
  }
  if (node.isKind(SyntaxKind.CallExpression)) {
    const expr = (node as CallExpression).getExpression();
    if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
      return expr.getText();
    }
  }
  return null;
}

function hasNonTrivialSignature(sourceFile: SourceFile, mockName: string): boolean {
  const baseName = mockName.replace(/^mock/, "").replace(/^Mock/, "");
  const _fnName = `${baseName.charAt(0).toLowerCase()}${baseName.slice(1)}`;

  let foundNonTrivial = false;

  sourceFile.forEachDescendant((node) => {
    if (foundNonTrivial) return;

    if (node.isKind(SyntaxKind.CallExpression)) {
      const call = node as CallExpression;
      const expr = call.getExpression();

      if (expr.isKind(SyntaxKind.PropertyAccessExpression) && expr.getName() === "fn") {
        const fnObj = expr.getExpression();
        if (
          fnObj.isKind(SyntaxKind.Identifier) &&
          (fnObj.getText() === "jest" || fnObj.getText() === "vi")
        ) {
          const fnArgs = call.getArguments();
          if (fnArgs.length > 0) {
            const impl = fnArgs[0];
            if (
              impl.isKind(SyntaxKind.ArrowFunction) ||
              impl.isKind(SyntaxKind.FunctionExpression)
            ) {
              const params = impl.getParameters();
              if (params.length > 0) {
                foundNonTrivial = true;
              }
            }
          }
        }
      }
    }

    if (node.isKind(SyntaxKind.CallExpression)) {
      const call = node as CallExpression;
      const text = call.getText();
      if (text.includes(mockName) && text.includes("mockImplementation")) {
        const args = call.getArguments();
        if (args.length > 0) {
          const impl = args[0];
          if (impl.isKind(SyntaxKind.ArrowFunction) || impl.isKind(SyntaxKind.FunctionExpression)) {
            if (impl.getParameters().length > 0) {
              foundNonTrivial = true;
            }
          }
        }
      }
    }
  });

  if (foundNonTrivial) return true;

  // Check type annotations on the mock variable
  sourceFile.forEachDescendant((node) => {
    if (foundNonTrivial) return;
    if (node.isKind(SyntaxKind.VariableDeclaration)) {
      const name = node.getName();
      if (name === mockName) {
        const typeNode = node.getTypeNode();
        if (typeNode) {
          const typeText = typeNode.getText();
          if (
            typeText.includes("=>") ||
            typeText.includes("Mock") ||
            typeText.includes("SpyInstance")
          ) {
            foundNonTrivial = true;
          }
        }
      }
    }
  });

  return foundNonTrivial;
}
