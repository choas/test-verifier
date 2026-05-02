import type { LlmPromptInput } from "./types";

export function buildSystemPrompt(): string {
  return `You are a test change analyst for a code review system. Your job is to determine whether a test file change weakens the test suite.

A test change "weakens" the suite when it makes tests less effective at catching real bugs. Common patterns:
- Replacing a strict matcher with a looser one (e.g. toBe → toBeDefined)
- Removing assertions without replacing them
- Changing expected values to match buggy output instead of fixing the bug
- Adding .skip or .todo to disable passing tests
- Introducing tautological assertions (expect(true).toBe(true))

A test change is legitimate when it:
- Updates expected values to match intentional production behavior changes
- Refactors test structure without reducing coverage
- Adds new assertions or test cases
- Removes tests for deleted production code

You will receive:
1. The test file path
2. The unified diff of the test file change
3. Rule engine findings (automated static analysis results with severity levels)
4. Related production file diffs from the same commit (if any)

Use the production diffs to determine whether a test change is tracking a legitimate production change or masking a bug.

Respond with a single JSON object. No markdown fences, no commentary outside the JSON.

Required JSON schema:
{
  "summary": "<string: one-sentence description of what changed and why it matters>",
  "risk_assessment": "<string: one of SAFE, LOW, SUSPICIOUS, CRITICAL>",
  "concerns": ["<string: specific concern>", "..."],
  "recommendation": "<string: actionable next step for the human reviewer>"
}

Risk assessment guidelines:
- SAFE: test change clearly tracks a legitimate production change, or adds coverage
- LOW: minor change that is unlikely to weaken the suite but warrants a glance
- SUSPICIOUS: change pattern matches known weakening techniques; reviewer should inspect carefully
- CRITICAL: strong evidence the test was weakened to hide a bug; block until reviewed`;
}

export function buildUserPrompt(input: LlmPromptInput): string {
  const parts: string[] = [];

  parts.push(`## Test File\n\`${input.testFilePath}\``);

  parts.push(`## Test Diff\n\`\`\`diff\n${input.testDiff}\n\`\`\``);

  if (input.ruleFindings.length > 0) {
    parts.push(
      "## Rule Engine Findings\n" +
        input.ruleFindings
          .map((f) => `- **[${f.severity}]** \`${f.rule}\` (line ${f.line}): ${f.message}`)
          .join("\n"),
    );
  } else {
    parts.push("## Rule Engine Findings\nNo findings from static analysis.");
  }

  if (input.relatedProdDiffs) {
    parts.push(`## Related Production Code Changes\n\`\`\`diff\n${input.relatedProdDiffs}\n\`\`\``);
  } else {
    parts.push(
      "## Related Production Code Changes\nNo production files were modified in the same commit.",
    );
  }

  return parts.join("\n\n");
}
