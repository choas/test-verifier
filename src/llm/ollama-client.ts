import { z } from "zod";
import {
  LlmResponseSchema,
  type LlmClient,
  type LlmConfig,
  type LlmPromptInput,
  type LlmResponse,
} from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder";

const OllamaChatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

function parseResponse(raw: string): LlmResponse {
  const trimmed = raw.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(trimmed);
  return LlmResponseSchema.parse(parsed);
}

export class OllamaClient implements LlmClient {
  private readonly config: LlmConfig;

  constructor(config: Partial<LlmConfig> & { model: string }) {
    this.config = {
      provider: "ollama",
      baseUrl: config.baseUrl ?? "http://localhost:11434",
      timeoutMs: config.timeoutMs ?? 300_000,
      model: config.model,
    };
  }

  async analyze(input: LlmPromptInput): Promise<LlmResponse> {
    const body = {
      model: this.config.model,
      stream: false,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(input) },
      ],
    };

    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch(
        `${this.config.baseUrl}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Ollama request failed: ${response.status} ${response.statusText}`,
        );
      }

      const json: unknown = await response.json();
      const chatResult = OllamaChatResponseSchema.safeParse(json);
      if (!chatResult.success) {
        throw new Error("Ollama returned empty response");
      }

      try {
        return parseResponse(chatResult.data.message.content);
      } catch (e) {
        lastError = e;
      }
    }

    throw new Error(
      `Failed to parse LLM response after retry: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }

  async chat(prompt: string): Promise<string> {
    const body = {
      model: this.config.model,
      stream: false,
      messages: [{ role: "user", content: prompt }],
    };

    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const json: unknown = await response.json();
    const chatResult = OllamaChatResponseSchema.safeParse(json);
    if (!chatResult.success) {
      throw new Error("Ollama returned empty response");
    }

    return chatResult.data.message.content;
  }
}
