import { extractTestBlocksPair } from "./test-block-extractor";
import type { FileDiff } from "./diff-parser";
import { Severity, type Finding } from "./types";
import type { TestVerifierConfig } from "./config";
import { detectSkipChanges } from "./rules/skip-detector";
import { detectAssertionRemoval } from "./rules/assertion-removal";
import { detectMatcherTransitions } from "./rules/matcher-transitions";
import { detectTautologies } from "./rules/tautology-detector";
import { classifySafeChanges } from "./rules/safe-classifier";
import { detectValueChanges } from "./rules/value-change-detector";
import { detectSnapshotChanges } from "./rules/snapshot-handler";

export interface RuleEngineInput {
  filePath: string;
  beforeContent: string;
  afterContent: string;
  diffs?: FileDiff[];
  config: TestVerifierConfig;
}

export interface RuleEngineResult {
  filePath: string;
  findings: Finding[];
  overallSeverity: Severity;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  [Severity.SAFE]: 0,
  [Severity.LOW]: 1,
  [Severity.SUSPICIOUS]: 2,
  [Severity.CRITICAL]: 3,
};

export function maxSeverity(findings: Finding[]): Severity {
  let max = Severity.SAFE;
  for (const f of findings) {
    if (SEVERITY_ORDER[f.severity] > SEVERITY_ORDER[max]) {
      max = f.severity;
    }
  }
  return max;
}

export function runRuleEngine(input: RuleEngineInput): RuleEngineResult {
  const { filePath, beforeContent, afterContent, diffs, config } = input;
  const findings: Finding[] = [];

  const { before, after } = extractTestBlocksPair(beforeContent, afterContent, filePath);

  findings.push(
    ...classifySafeChanges({
      beforeSource: beforeContent,
      afterSource: afterContent,
      filePath,
    }),
  );

  findings.push(...detectSkipChanges(before, after, config));

  const assertionFindings = detectAssertionRemoval({
    beforeSource: beforeContent,
    afterSource: afterContent,
    filePath,
  });
  const assertionRemovedSeverity = config.rules.assertionRemoved;
  for (const f of assertionFindings) {
    if (
      f.rule === "assertion-removal/test-deleted" ||
      f.rule === "assertion-removal/assertion-removed"
    ) {
      f.severity = assertionRemovedSeverity;
    }
    findings.push(f);
  }

  findings.push(...detectMatcherTransitions(before, after, config.rules.matcherTransitions));

  if (afterContent.trim()) {
    findings.push(
      ...detectTautologies(afterContent, filePath, {
        severity: config.rules.tautology.static,
      }),
    );
  }

  findings.push(...detectValueChanges(before, after));

  if (diffs && diffs.length > 0) {
    findings.push(
      ...detectSnapshotChanges(diffs, {
        inline: config.rules.snapshot.inline,
        pairedUpdate: config.rules.snapshot.pairedUpdate,
        unpairedUpdate: config.rules.snapshot.unpairedUpdate,
        deletion: config.rules.snapshot.deletion,
        maxDiffSizeForLLM: config.rules.snapshot.maxDiffSizeForLLM,
        truncationStrategy: config.rules.snapshot.truncationStrategy,
      }),
    );
  }

  return {
    filePath,
    findings,
    overallSeverity: maxSeverity(findings),
  };
}
