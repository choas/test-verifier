import type { TestBlock } from "../test-block-extractor";
import { Severity, type Finding } from "../types";

export const DEFAULT_TRANSITIONS: Record<string, Severity> = {
  "toBe->toEqual": Severity.SUSPICIOUS,
  "toBe->toBeDefined": Severity.CRITICAL,
  "toBe->toBeTruthy": Severity.CRITICAL,
  "toBe->toBeFalsy": Severity.CRITICAL,
  "toEqual->toMatchObject": Severity.SUSPICIOUS,
  "toEqual->toBeDefined": Severity.CRITICAL,
  "toStrictEqual->toEqual": Severity.SUSPICIOUS,
  "toStrictEqual->toMatchObject": Severity.CRITICAL,
  "toHaveLength->toBeDefined": Severity.CRITICAL,
  "toThrow->not.toThrow": Severity.CRITICAL,
  "toHaveBeenCalledTimes->toHaveBeenCalled": Severity.SUSPICIOUS,
};

export function detectMatcherTransitions(
  before: TestBlock[],
  after: TestBlock[],
  transitionTable: Record<string, Severity> = DEFAULT_TRANSITIONS,
  matcherRemovedSeverity: Severity = Severity.CRITICAL,
): Finding[] {
  const findings: Finding[] = [];

  const flatBefore = flattenTests(before);
  const flatAfter = flattenTests(after);

  const afterByName = new Map<string, FlatTest>();
  for (const t of flatAfter) {
    afterByName.set(t.qualifiedName, t);
  }

  for (const oldTest of flatBefore) {
    const newTest = afterByName.get(oldTest.qualifiedName);
    if (!newTest) continue;

    for (let i = 0; i < oldTest.assertions.length; i++) {
      const beforeA = oldTest.assertions[i];
      const afterA = newTest.assertions[i];

      if (!afterA) {
        findings.push({
          rule: "matcher-transition",
          severity: matcherRemovedSeverity,
          line: beforeA.line,
          message: `Matcher removed: "${beforeA.matcher}" in "${oldTest.qualifiedName}" was removed entirely`,
          before: beforeA.text,
          after: "",
        });
        continue;
      }

      if (beforeA.matcher === afterA.matcher) continue;

      const key = `${beforeA.matcher}->${afterA.matcher}`;
      const severity = transitionTable[key];
      if (severity) {
        findings.push({
          rule: "matcher-transition",
          severity,
          line: afterA.line,
          message: `Matcher changed: "${beforeA.matcher}" → "${afterA.matcher}" in "${oldTest.qualifiedName}"`,
          before: beforeA.text,
          after: afterA.text,
        });
      }
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
