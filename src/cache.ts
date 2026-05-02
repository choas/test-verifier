import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { LlmResponseSchema, type LlmResponse } from "./llm/types";

const DEFAULT_MAX_AGE_DAYS = 90;
const DEFAULT_MAX_ENTRIES = 5000;

const CountRowSchema = z.object({ cnt: z.number() });
const CacheRowSchema = z.object({ response: z.string() });

export class AnalysisCache {
  private db: Database;
  private maxAgeDays: number;
  private maxEntries: number;

  constructor(auditDir: string, opts?: { maxAgeDays?: number; maxEntries?: number }) {
    const dbPath = join(auditDir, "cache.sqlite");
    this.db = new Database(dbPath, { create: true });
    this.db.run(
      `CREATE TABLE IF NOT EXISTS analysis_cache (
        key TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    );
    this.maxAgeDays = opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
    this.maxEntries = opts?.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.prune();
  }

  private prune(): void {
    const cutoff = new Date(Date.now() - this.maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
    this.db.run("DELETE FROM analysis_cache WHERE created_at < ?", [cutoff]);

    const countRow = CountRowSchema.parse(
      this.db.query("SELECT COUNT(*) as cnt FROM analysis_cache").get(),
    );
    if (countRow.cnt > this.maxEntries) {
      this.db.run(
        `DELETE FROM analysis_cache WHERE key NOT IN (
          SELECT key FROM analysis_cache ORDER BY created_at DESC LIMIT ?
        )`,
        [this.maxEntries],
      );
    }
  }

  static computeKey(testDiff: string, relatedProdDiff: string, modelVersion: string): string {
    const input = JSON.stringify([testDiff, relatedProdDiff, modelVersion]);
    return createHash("sha256").update(input).digest("hex");
  }

  get(key: string): LlmResponse | null {
    const raw = this.db.query("SELECT response FROM analysis_cache WHERE key = ?").get(key);
    if (!raw) return null;

    try {
      const row = CacheRowSchema.parse(raw);
      return LlmResponseSchema.parse(JSON.parse(row.response));
    } catch (_e) {
      console.error(`  warn: deleting corrupt cache entry for key ${key}`);
      this.db.run("DELETE FROM analysis_cache WHERE key = ?", [key]);
      return null;
    }
  }

  set(key: string, response: LlmResponse, model: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO analysis_cache (key, response, model, created_at) VALUES (?, ?, ?, ?)",
      [key, JSON.stringify(response), model, new Date().toISOString()],
    );
    this.prune();
  }

  close(): void {
    this.db.close();
  }
}
