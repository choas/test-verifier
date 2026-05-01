import Anthropic from "@anthropic-ai/sdk";
import { LlmResponseSchema, type LlmClient, type LlmPromptInput, type LlmResponse } from "./types";
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder";

export class AnthropicClient implements LlmClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: { model: string; timeoutMs?: number; apiKey?: string }) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs ?? 30_000,
    });
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  async analyze(input: LlmPromptInput): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      temperature: 0,
      system: buildSystemPrompt(),
      messages: [
        { role: "user", content: buildUserPrompt(input) },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic returned no text content");
    }

    const trimmed = textBlock.text.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(trimmed);
    return LlmResponseSchema.parse(parsed);
  }

  async chat(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic returned no text content");
    }

    return textBlock.text;
  }
}
