import type { TestBlock } from "../test-block-extractor";
import { Severity, type Finding } from "../types";
import type { TestVerifierConfig } from "../config";

interface SkipState {
  skip: boolean;
  todo: boolean;
  skipIf: boolean;
}

function isSkipped(block: TestBlock): SkipState {
  return { skip: block.skip, todo: block.todo, skipIf: block.skipIf };
}

function isActive(state: SkipState): boolean {
  return !state.skip && !state.todo && !state.skipIf;
}

function skipLabel(state: SkipState): string {
  if (state.skip) return ".skip";
  if (state.todo) return ".todo";
  if (state.skipIf) return ".skipIf";
  return "";
}

function flattenBlocks(blocks: TestBlock[]): TestBlock[] {
  const result: TestBlock[] = [];
  for (const block of blocks) {
    result.push(block);
    if (block.children.length > 0) {
      result.push(...flattenBlocks(block.children));
    }
  }
  return result;
}

export function detectSkipChanges(
  before: TestBlock[],
  after: TestBlock[],
  config?: TestVerifierConfig,
): Finding[] {
  const findings: Finding[] = [];
  const skipSeverity = config?.rules.skipAnnotation ?? Severity.CRITICAL;
  const todoSeverity = config?.rules.todoAnnotation ?? Severity.CRITICAL;

  const flatBefore = flattenBlocks(before);
  const flatAfter = flattenBlocks(after);

  const beforeByName = new Map<string, TestBlock>();
  for (const block of flatBefore) {
    beforeByName.set(key(block), block);
  }

  for (const afterBlock of flatAfter) {
    const k = key(afterBlock);
    const beforeBlock = beforeByName.get(k);

    if (!beforeBlock) {
      const afterState = isSkipped(afterBlock);
      if (!isActive(afterState)) {
        const severity = afterState.todo ? todoSeverity : skipSeverity;
        findings.push({
          rule: "skip-detector",
          severity,
          line: afterBlock.startLine,
          message: `New ${afterBlock.type} "${afterBlock.name}" added with ${skipLabel(afterState)}`,
          before: "",
          after: `${afterBlock.type}${skipLabel(afterState)}("${afterBlock.name}")`,
        });
      }
      continue;
    }

    const beforeState = isSkipped(beforeBlock);
    const afterState = isSkipped(afterBlock);

    if (isActive(beforeState) && !isActive(afterState)) {
      const severity = afterState.todo ? todoSeverity : skipSeverity;
      findings.push({
        rule: "skip-detector",
        severity,
        line: afterBlock.startLine,
        message: `${afterBlock.type} "${afterBlock.name}" was disabled with ${skipLabel(afterState)}`,
        before: `${beforeBlock.type}("${beforeBlock.name}")`,
        after: `${afterBlock.type}${skipLabel(afterState)}("${afterBlock.name}")`,
      });
    } else if (!isActive(beforeState) && isActive(afterState)) {
      findings.push({
        rule: "skip-detector",
        severity: Severity.SAFE,
        line: afterBlock.startLine,
        message: `${afterBlock.type} "${afterBlock.name}" was re-enabled (removed ${skipLabel(beforeState)})`,
        before: `${beforeBlock.type}${skipLabel(beforeState)}("${beforeBlock.name}")`,
        after: `${afterBlock.type}("${afterBlock.name}")`,
      });
    } else if (
      !isActive(beforeState) &&
      !isActive(afterState) &&
      skipLabel(beforeState) !== skipLabel(afterState)
    ) {
      const severity = afterState.todo ? todoSeverity : skipSeverity;
      findings.push({
        rule: "skip-detector",
        severity,
        line: afterBlock.startLine,
        message: `${afterBlock.type} "${afterBlock.name}" changed from ${skipLabel(beforeState)} to ${skipLabel(afterState)}`,
        before: `${beforeBlock.type}${skipLabel(beforeState)}("${beforeBlock.name}")`,
        after: `${afterBlock.type}${skipLabel(afterState)}("${afterBlock.name}")`,
      });
    }
  }

  return findings;
}

function key(block: TestBlock): string {
  return `${block.type}::${block.name}`;
}
