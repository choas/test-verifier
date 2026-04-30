import type { TestVerifierConfig } from "../config";
import type { LlmClient } from "./types";
import { AnthropicClient } from "./anthropic-client";
import { OllamaClient } from "./ollama-client";

export function createLlmClient(config: TestVerifierConfig): LlmClient {
  const { provider, model, timeoutMs, apiKeyEnv } = config.llm;

  switch (provider) {
    case "anthropic": {
      const apiKey = process.env[apiKeyEnv];
      if (!apiKey) {
        throw new Error(
          `Missing API key: set the ${apiKeyEnv} environment variable`,
        );
      }
      return new AnthropicClient({ model, timeoutMs, apiKey });
    }
    case "ollama":
      return new OllamaClient({ model, timeoutMs });
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export type { LlmClient } from "./types";
