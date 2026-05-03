import { z } from "zod";

export const LlmResponseSchema = z.object({
  summary: z.string(),
  risk_assessment: z.enum(["SAFE", "LOW", "SUSPICIOUS", "CRITICAL"]),
  concerns: z.array(z.string()),
  recommendation: z.string(),
});

export type LlmResponse = z.infer<typeof LlmResponseSchema>;

export interface LlmPromptInput {
  testFilePath: string;
  testDiff: string;
  ruleFindings: {
    rule: string;
    severity: string;
    message: string;
    line: number;
  }[];
  relatedProdDiffs: string;
}

export interface LlmClient {
  analyze(input: LlmPromptInput): Promise<LlmResponse>;
  chat(prompt: string): Promise<string>;
}

export interface LlmConfig {
  provider: "ollama" | "anthropic";
  model: string;
  baseUrl: string;
  timeoutMs: number;
}
