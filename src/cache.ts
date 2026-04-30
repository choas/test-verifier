import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { LlmResponseSchema, type LlmResponse } from "./llm/types";

export class AnalysisCache {
  private db: Database;

  constructor(auditDir: string) {
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
  }

  static computeKey(
    testDiff: string,
    relatedProdDiff: string,
    modelVersion: string,
  ): string {
    const input = testDiff + relatedProdDiff + modelVersion;
    return createHash("sha256").update(input).digest("hex");
  }

  get(key: string): LlmResponse | null {
    const row = this.db
      .query("SELECT response FROM analysis_cache WHERE key = ?")
      .get(key) as { response: string } | null;
    if (!row) return null;
    return LlmResponseSchema.parse(JSON.parse(row.response));
  }

  set(key: string, response: LlmResponse, model: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO analysis_cache (key, response, model, created_at) VALUES (?, ?, ?, ?)",
      [key, JSON.stringify(response), model, new Date().toISOString()],
    );
  }

  close(): void {
    this.db.close();
  }
}
