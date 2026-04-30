import { z } from "zod";
import { Severity } from "./types";

const severityEnum = z.enum([
  Severity.SAFE,
  Severity.LOW,
  Severity.SUSPICIOUS,
  Severity.CRITICAL,
]);

const matcherTransitionsSchema = z.record(z.string(), severityEnum).default({
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
});

const tautologyInner = z.object({
  static: severityEnum.default(Severity.CRITICAL),
  llmDetected: severityEnum.default(Severity.SUSPICIOUS),
});

const snapshotInner = z.object({
  inline: severityEnum.default(Severity.SUSPICIOUS),
  pairedUpdate: severityEnum.default(Severity.SUSPICIOUS),
  unpairedUpdate: severityEnum.default(Severity.CRITICAL),
  deletion: severityEnum.default(Severity.CRITICAL),
  maxDiffSizeForLLM: z.number().int().positive().default(10_000),
  truncationStrategy: z
    .enum(["head-tail", "sample", "summary"])
    .default("head-tail"),
});

const rulesInner = z.object({
  matcherTransitions: matcherTransitionsSchema,
  tautology: tautologyInner.default(() => tautologyInner.parse({})),
  snapshot: snapshotInner.default(() => snapshotInner.parse({})),
  skipAnnotation: severityEnum.default(Severity.CRITICAL),
  todoAnnotation: severityEnum.default(Severity.CRITICAL),
  assertionRemoved: severityEnum.default(Severity.CRITICAL),
});

const llmInner = z.object({
  provider: z.enum(["ollama", "anthropic"]).default("anthropic"),
  model: z.string().default("claude-sonnet-4-7"),
  timeoutMs: z.number().int().positive().optional(),
  apiKeyEnv: z.string().default("ANTHROPIC_API_KEY"),
  relatedProdLookback: z.number().int().min(0).default(0),
});

const policyInner = z.object({
  autoApprove: z.array(severityEnum).default([Severity.SAFE]),
  requireHumanFor: z
    .array(severityEnum)
    .default([Severity.LOW, Severity.SUSPICIOUS, Severity.CRITICAL]),
  blockPushIfPending: z.boolean().default(true),
  blockMergeIfRejected: z.boolean().default(true),
});

const auditInner = z.object({
  folder: z.string().default(".test-verifier"),
  compactPeriod: z
    .enum(["month", "quarter", "year", "never"])
    .default("quarter"),
});

const cryptoInner = z.object({
  signing: z.enum(["ed25519", "gpg"]).default("ed25519"),
});

export const configSchema = z.object({
  testGlobs: z
    .array(z.string())
    .default(["**/*.test.ts", "**/*.spec.ts", "**/*.test.svelte.ts"]),
  excludeGlobs: z.array(z.string()).default(["**/node_modules/**"]),
  llm: llmInner.default(() => llmInner.parse({})),
  policy: policyInner.default(() => policyInner.parse({})),
  rules: rulesInner.default(() => rulesInner.parse({})),
  audit: auditInner.default(() => auditInner.parse({})),
  crypto: cryptoInner.default(() => cryptoInner.parse({})),
});

export type TestVerifierConfig = z.output<typeof configSchema>;
export type TestVerifierInput = z.input<typeof configSchema>;

export function defineConfig(input: TestVerifierInput = {}): TestVerifierConfig {
  return configSchema.parse(input);
}

const CONFIG_FILENAMES = [
  "test-verifier.config.ts",
  "test-verifier.config.js",
];

export async function loadConfig(
  cwd: string = process.cwd(),
): Promise<TestVerifierConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = `${cwd}/${filename}`;
    const file = Bun.file(filepath);
    if (await file.exists()) {
      const mod = await import(filepath);
      const raw = mod.default ?? mod;
      return configSchema.parse(raw);
    }
  }
  return configSchema.parse({});
}
