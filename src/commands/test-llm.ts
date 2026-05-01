import { loadConfig } from "../config";
import { createLlmClient } from "../llm";

const DEFAULT_PROMPT = `Analyze this test diff and respond with a JSON object containing: summary, risk_assessment (SAFE/LOW/SUSPICIOUS/CRITICAL), concerns (array), and recommendation.

## Test File
\`src/utils/math.test.ts\`

## Test Diff
\`\`\`diff
- expect(add(2, 3)).toBe(5);
+ expect(add(2, 3)).toBeDefined();
\`\`\`

## Rule Engine Findings
- **[warning]** \`matcher-weakening\` (line 10): Matcher was weakened from toBe to toBeDefined

## Related Production Code Changes
No production files were modified in the same commit.`;

export async function testLlm(
  cwd: string = process.cwd(),
  prompt?: string,
): Promise<void> {
  const config = await loadConfig(cwd);

  let client;
  try {
    client = createLlmClient(config);
  } catch (e) {
    console.error(
      `test-verifier: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }

  const text = prompt ?? DEFAULT_PROMPT;

  console.log(`Provider: ${config.llm.provider}`);
  console.log(`Model:    ${config.llm.model}`);
  console.log(`Prompt:   ${text.length > 80 ? text.slice(0, 80) + "…" : text}`);
  console.log();

  try {
    const response = await client.chat(text);
    console.log(response);
  } catch (e) {
    console.error(
      `test-verifier: LLM error: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(1);
  }
}
