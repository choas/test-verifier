import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AnalysisCache } from "./cache";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { LlmResponse } from "./llm/types";

const SAMPLE_RESPONSE: LlmResponse = {
  summary: "Test change weakens assertion coverage",
  risk_assessment: "SUSPICIOUS",
  concerns: ["Assertion removed", "Matcher downgraded"],
  recommendation: "Review the removed assertions",
};

describe("AnalysisCache", () => {
  let tempDir: string;
  let cache: AnalysisCache;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    cache = new AnalysisCache(tempDir);
  });

  afterEach(() => {
    cache.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("returns null for missing key", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  test("stores and retrieves a response", () => {
    const key = AnalysisCache.computeKey("diff1", "prod1", "model-v1");
    cache.set(key, SAMPLE_RESPONSE, "model-v1");
    const result = cache.get(key);
    expect(result).toEqual(SAMPLE_RESPONSE);
  });

  test("overwrites existing key", () => {
    const key = AnalysisCache.computeKey("diff1", "prod1", "model-v1");
    cache.set(key, SAMPLE_RESPONSE, "model-v1");

    const updated: LlmResponse = {
      ...SAMPLE_RESPONSE,
      summary: "Updated analysis",
    };
    cache.set(key, updated, "model-v1");

    const result = cache.get(key);
    expect(result?.summary).toBe("Updated analysis");
  });

  test("different inputs produce different keys", () => {
    const key1 = AnalysisCache.computeKey("diff1", "prod1", "model-v1");
    const key2 = AnalysisCache.computeKey("diff2", "prod1", "model-v1");
    const key3 = AnalysisCache.computeKey("diff1", "prod2", "model-v1");
    const key4 = AnalysisCache.computeKey("diff1", "prod1", "model-v2");
    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).not.toBe(key4);
  });

  test("same inputs produce same key", () => {
    const key1 = AnalysisCache.computeKey("diff1", "prod1", "v1");
    const key2 = AnalysisCache.computeKey("diff1", "prod1", "v1");
    expect(key1).toBe(key2);
  });

  test("key is a valid hex hash", () => {
    const key = AnalysisCache.computeKey("diff", "prod", "model");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("stores multiple entries independently", () => {
    const key1 = AnalysisCache.computeKey("diff1", "prod1", "v1");
    const key2 = AnalysisCache.computeKey("diff2", "prod2", "v1");

    const response1: LlmResponse = { ...SAMPLE_RESPONSE, summary: "first" };
    const response2: LlmResponse = { ...SAMPLE_RESPONSE, summary: "second" };

    cache.set(key1, response1, "v1");
    cache.set(key2, response2, "v1");

    expect(cache.get(key1)?.summary).toBe("first");
    expect(cache.get(key2)?.summary).toBe("second");
  });

  test("handles empty string inputs for key computation", () => {
    const key = AnalysisCache.computeKey("", "", "");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("handles non-ASCII content in diffs", () => {
    const key = AnalysisCache.computeKey(
      "expect(x).toBe('こんにちは')",
      "const greeting = 'Привет'",
      "model-v1",
    );
    const response: LlmResponse = {
      ...SAMPLE_RESPONSE,
      summary: "Non-ASCII test",
    };
    cache.set(key, response, "model-v1");
    expect(cache.get(key)?.summary).toBe("Non-ASCII test");
  });

  test("persists across cache instances for same directory", () => {
    const key = AnalysisCache.computeKey("diff", "prod", "v1");
    cache.set(key, SAMPLE_RESPONSE, "v1");
    cache.close();

    const cache2 = new AnalysisCache(tempDir);
    expect(cache2.get(key)).toEqual(SAMPLE_RESPONSE);
    cache2.close();

    cache = new AnalysisCache(tempDir);
  });
});
