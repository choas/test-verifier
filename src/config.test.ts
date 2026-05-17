import { describe, test, expect } from "bun:test";
import { defineConfig, configSchema } from "./config";
import { Severity } from "./types";

describe("defineConfig", () => {
  test("returns defaults when called with no arguments", () => {
    const config = defineConfig();
    expect(config.testGlobs).toEqual([
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.test.js",
      "**/*.spec.js",
      "**/*.test.tsx",
      "**/*.spec.tsx",
      "**/*.test.jsx",
      "**/*.spec.jsx",
      "**/*.test.mts",
      "**/*.spec.mts",
      "**/*.test.mjs",
      "**/*.spec.mjs",
      "**/*.test.svelte.ts",
    ]);
    expect(config.excludeGlobs).toEqual(["**/node_modules/**"]);
    expect(config.llm.provider).toBe("anthropic");
    expect(config.llm.model).toBe("claude-sonnet-4-7");
    expect(config.policy.autoApprove).toEqual([Severity.SAFE]);
    expect(config.rules.assertionRemoved).toBe(Severity.CRITICAL);
    expect(config.rules.skipAnnotation).toBe(Severity.CRITICAL);
    expect(config.rules.tautology.static).toBe(Severity.CRITICAL);
    expect(config.audit.compactPeriod).toBe("quarter");
    expect(config.crypto.signing).toBe("ed25519");
  });

  test("returns defaults when called with empty object", () => {
    const config = defineConfig({});
    expect(config.testGlobs).toEqual([
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.test.js",
      "**/*.spec.js",
      "**/*.test.tsx",
      "**/*.spec.tsx",
      "**/*.test.jsx",
      "**/*.spec.jsx",
      "**/*.test.mts",
      "**/*.spec.mts",
      "**/*.test.mjs",
      "**/*.spec.mjs",
      "**/*.test.svelte.ts",
    ]);
  });

  test("overrides specific fields while keeping other defaults", () => {
    const config = defineConfig({
      testGlobs: ["**/*.spec.tsx"],
      rules: { assertionRemoved: Severity.SUSPICIOUS },
    });
    expect(config.testGlobs).toEqual(["**/*.spec.tsx"]);
    expect(config.rules.assertionRemoved).toBe(Severity.SUSPICIOUS);
    expect(config.rules.skipAnnotation).toBe(Severity.CRITICAL);
    expect(config.llm.provider).toBe("anthropic");
  });

  test("overrides llm provider", () => {
    const config = defineConfig({
      llm: { provider: "ollama", model: "llama3" },
    });
    expect(config.llm.provider).toBe("ollama");
    expect(config.llm.model).toBe("llama3");
  });

  test("overrides policy settings", () => {
    const config = defineConfig({
      policy: {
        autoApprove: [Severity.SAFE, Severity.LOW],
        blockPushIfPending: false,
      },
    });
    expect(config.policy.autoApprove).toEqual([Severity.SAFE, Severity.LOW]);
    expect(config.policy.blockPushIfPending).toBe(false);
    expect(config.policy.blockMergeIfRejected).toBe(true);
  });

  test("overrides matcher transitions", () => {
    const config = defineConfig({
      rules: {
        matcherTransitions: { "toBe->toEqual": Severity.LOW },
      },
    });
    expect(config.rules.matcherTransitions["toBe->toEqual"]).toBe(Severity.LOW);
  });

  test("overrides snapshot config", () => {
    const config = defineConfig({
      rules: {
        snapshot: {
          truncationStrategy: "sample",
          maxDiffSizeForLLM: 5000,
        },
      },
    });
    expect(config.rules.snapshot.truncationStrategy).toBe("sample");
    expect(config.rules.snapshot.maxDiffSizeForLLM).toBe(5000);
  });

  test("overrides audit config", () => {
    const config = defineConfig({
      audit: { compactPeriod: "never", cacheTtlDays: 30 },
    });
    expect(config.audit.compactPeriod).toBe("never");
    expect(config.audit.cacheTtlDays).toBe(30);
  });

  test("rejects invalid severity value", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => defineConfig({ rules: { assertionRemoved: "INVALID" as any } })).toThrow();
  });

  test("rejects invalid llm provider", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => defineConfig({ llm: { provider: "openai" as any } })).toThrow();
  });

  test("rejects negative cacheTtlDays", () => {
    expect(() => defineConfig({ audit: { cacheTtlDays: -1 } })).toThrow();
  });

  test("rejects invalid truncation strategy", () => {
    expect(() =>
      defineConfig({
        // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
        rules: { snapshot: { truncationStrategy: "invalid" as any } },
      }),
    ).toThrow();
  });
});

describe("configSchema", () => {
  test("parses empty object to full defaults", () => {
    const result = configSchema.parse({});
    expect(result.testGlobs).toBeDefined();
    expect(result.llm).toBeDefined();
    expect(result.policy).toBeDefined();
    expect(result.rules).toBeDefined();
    expect(result.audit).toBeDefined();
    expect(result.crypto).toBeDefined();
  });

  test("default matcher transitions have 11 entries", () => {
    const config = configSchema.parse({});
    expect(Object.keys(config.rules.matcherTransitions)).toHaveLength(11);
  });
});
