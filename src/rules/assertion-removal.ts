import { Severity, type Finding } from "../types";
import { extractTestBlocksPair, type TestBlock, type Assertion } from "../test-block-extractor";

export interface AssertionRemovalInput {
  beforeSource: string;
  afterSource: string;
  filePath?: string;
}

export function detectAssertionRemoval(input: AssertionRemovalInput): Finding[] {
  const { before, after } = extractTestBlocksPair(
    input.beforeSource,
    input.afterSource,
    input.filePath,
  );

  const flatBefore = flattenTests(before);
  const flatAfter = flattenTests(after);

  const afterByName = new Map<string, FlatTest[]>();
  for (const t of flatAfter) {
    const existing = afterByName.get(t.qualifiedName) ?? [];
    existing.push(t);
    afterByName.set(t.qualifiedName, existing);
  }

  const allAfterAssertions = collectAllAssertionTexts(flatAfter);

  const findings: Finding[] = [];

  for (const oldTest of flatBefore) {
    const matches = afterByName.get(oldTest.qualifiedName);

    if (!matches || matches.length === 0) {
      findings.push({
        rule: "assertion-removal/test-deleted",
        severity: Severity.CRITICAL,
        line: oldTest.startLine,
        message: `Test "${oldTest.qualifiedName}" was deleted`,
        before: oldTest.body,
        after: "",
      });
      continue;
    }

    const newTest = matches[0];
    const removedAssertions = findRemovedAssertions(oldTest.assertions, newTest.assertions);

    if (removedAssertions.length === 0) continue;

    for (const removed of removedAssertions) {
      const movedElsewhere = allAfterAssertions.has(normalizeAssertionText(removed.text));

      if (movedElsewhere) {
        findings.push({
          rule: "assertion-removal/assertion-moved",
          severity: Severity.LOW,
          line: removed.line,
          message: `Assertion "${removed.matcher}" moved from test "${oldTest.qualifiedName}" — verify destination test covers the same scenario`,
          before: removed.text,
          after: "",
        });
      } else {
        findings.push({
          rule: "assertion-removal/assertion-removed",
          severity: Severity.CRITICAL,
          line: removed.line,
          message: `Assertion "${removed.matcher}" removed from test "${oldTest.qualifiedName}" without replacement`,
          before: removed.text,
          after: "",
        });
      }
    }
  }

  return findings;
}

interface FlatTest {
  qualifiedName: string;
  startLine: number;
  assertions: Assertion[];
  body: string;
}

function flattenTests(blocks: TestBlock[], parentPath = ""): FlatTest[] {
  const result: FlatTest[] = [];

  for (const block of blocks) {
    const qualifiedName = parentPath ? `${parentPath} > ${block.name}` : block.name;

    if (block.type === "describe") {
      result.push(...flattenTests(block.children, qualifiedName));
    } else {
      result.push({
        qualifiedName,
        startLine: block.startLine,
        assertions: block.assertions,
        body: block.body,
      });
    }
  }

  return result;
}

function normalizeAssertionText(text: string): string {
  return text.replace(/\s+/g, "");
}

function findRemovedAssertions(before: Assertion[], after: Assertion[]): Assertion[] {
  const afterNormalized = new Set(after.map((a) => normalizeAssertionText(a.text)));
  return before.filter((a) => !afterNormalized.has(normalizeAssertionText(a.text)));
}

function collectAllAssertionTexts(tests: FlatTest[]): Set<string> {
  const texts = new Set<string>();
  for (const t of tests) {
    for (const a of t.assertions) {
      texts.add(normalizeAssertionText(a.text));
    }
  }
  return texts;
}
