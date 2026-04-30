import { Project, SyntaxKind } from "ts-morph";
import type { TestBlock } from "../test-block-extractor";
import { Severity, type Finding } from "../types";

export interface AssertionParts {
  subject: string;
  matcher: string;
  expectedArgs: string;
}

export function parseAssertionParts(assertionText: string): AssertionParts | null {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { allowJs: true },
  });
  const sf = project.createSourceFile("__parse.ts", assertionText + ";");

  const exprStmt = sf.getStatements()[0]?.asKind(SyntaxKind.ExpressionStatement);
  if (!exprStmt) return null;

  let topExpr = exprStmt.getExpression();

  const awaitExpr = topExpr.asKind(SyntaxKind.AwaitExpression);
  if (awaitExpr) {
    topExpr = awaitExpr.getExpression();
  }

  const outerCall = topExpr.asKind(SyntaxKind.CallExpression);
  if (!outerCall) return null;

  const expectedArgs = outerCall.getArguments().map((a) => a.getText()).join(", ");

  const propAccess = outerCall.getExpression().asKind(SyntaxKind.PropertyAccessExpression);
  if (!propAccess) return null;

  const matcherParts: string[] = [propAccess.getName()];
  let current = propAccess.getExpression();

  while (current.isKind(SyntaxKind.PropertyAccessExpression)) {
    const pae = current.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    matcherParts.unshift(pae.getName());
    current = pae.getExpression();
  }

  const expectCall = current.asKind(SyntaxKind.CallExpression);
  if (!expectCall) return null;

  const expectIdent = expectCall.getExpression().asKind(SyntaxKind.Identifier);
  if (!expectIdent || expectIdent.getText() !== "expect") return null;

  const subject = expectCall.getArguments()[0]?.getText() ?? "";

  return {
    subject,
    matcher: matcherParts.join("."),
    expectedArgs,
  };
}

export function detectValueChanges(
  before: TestBlock[],
  after: TestBlock[],
): Finding[] {
  const findings: Finding[] = [];

  const flatBefore = flattenTests(before);
  const flatAfter = flattenTests(after);

  const beforeByName = new Map<string, FlatTest>();
  for (const t of flatBefore) {
    beforeByName.set(t.qualifiedName, t);
  }

  for (const afterTest of flatAfter) {
    const beforeTest = beforeByName.get(afterTest.qualifiedName);
    if (!beforeTest) continue;

    const beforeParsed = beforeTest.assertions
      .map((a) => ({ ...a, parts: parseAssertionParts(a.text) }))
      .filter((a): a is typeof a & { parts: AssertionParts } => a.parts !== null);

    const afterParsed = afterTest.assertions
      .map((a) => ({ ...a, parts: parseAssertionParts(a.text) }))
      .filter((a): a is typeof a & { parts: AssertionParts } => a.parts !== null);

    const matched = new Set<number>();

    for (const afterAssert of afterParsed) {
      if (afterAssert.parts.expectedArgs === "") continue;

      const beforeIdx = beforeParsed.findIndex(
        (b, i) =>
          !matched.has(i) &&
          b.parts.subject === afterAssert.parts.subject &&
          b.parts.matcher === afterAssert.parts.matcher,
      );

      if (beforeIdx === -1) continue;
      matched.add(beforeIdx);

      const beforeAssert = beforeParsed[beforeIdx];
      if (beforeAssert.parts.expectedArgs === "") continue;
      if (beforeAssert.parts.expectedArgs === afterAssert.parts.expectedArgs) continue;

      findings.push({
        rule: "value-change",
        severity: Severity.SUSPICIOUS,
        line: afterAssert.line,
        message: `Expected value changed from ${beforeAssert.parts.expectedArgs} to ${afterAssert.parts.expectedArgs} in ${afterAssert.parts.matcher}(). The test subject ${afterAssert.parts.subject} is unchanged — verify this isn't chasing a buggy implementation.`,
        before: beforeAssert.text,
        after: afterAssert.text,
      });
    }
  }

  return findings;
}

interface FlatTest {
  qualifiedName: string;
  assertions: { matcher: string; line: number; text: string }[];
}

function flattenTests(blocks: TestBlock[], parentPath = ""): FlatTest[] {
  const result: FlatTest[] = [];
  for (const block of blocks) {
    const name = parentPath ? `${parentPath} > ${block.name}` : block.name;
    if (block.type === "describe") {
      result.push(...flattenTests(block.children, name));
    } else {
      result.push({ qualifiedName: name, assertions: block.assertions });
    }
  }
  return result;
}
