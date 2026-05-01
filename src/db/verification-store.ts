import { Database } from "bun:sqlite";
import { join } from "node:path";
import { z } from "zod";
import { SeveritySchema, StubStatusSchema, type Severity, type StubStatus } from "../types";

export interface VerificationRow {
  id: string;
  test_file: string;
  test_functions: string;
  rule: string;
  severity: string;
  status: string;
  commit_sha: string;
  parent_commit: string;
  diff_hash: string;
  created_at: string;
  updated_at: string;
  reviewer: string | null;
  rationale: string | null;
  parent_verification_id: string | null;
}

export interface VerificationRecord {
  id: string;
  testFile: string;
  testFunctions: string[];
  rule: string;
  severity: Severity;
  status: StubStatus;
  commit: string;
  parentCommit: string;
  diffHash: string;
  createdAt: string;
  updatedAt: string;
  reviewer: string | null;
  rationale: string | null;
  parentVerificationId: string | null;
}

const VerificationRowSchema = z.object({
  id: z.string(),
  test_file: z.string(),
  test_functions: z.string(),
  rule: z.string(),
  severity: z.string(),
  status: z.string(),
  commit_sha: z.string(),
  parent_commit: z.string(),
  diff_hash: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  reviewer: z.string().nullable(),
  rationale: z.string().nullable(),
  parent_verification_id: z.string().nullable(),
});

const SummaryRowSchema = z.object({
  status: z.string(),
  count: z.number(),
});

function parseRow(raw: unknown): VerificationRow {
  return VerificationRowSchema.parse(raw);
}

function parseRows(raw: unknown[]): VerificationRow[] {
  return raw.map((r) => VerificationRowSchema.parse(r));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export class VerificationStore {
  private db: Database;

  constructor(auditDir: string) {
    const dbPath = join(auditDir, "verifications.sqlite");
    this.db = new Database(dbPath, { create: true });
    this.db.run("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        test_file TEXT NOT NULL,
        test_functions TEXT NOT NULL DEFAULT '[]',
        rule TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        commit_sha TEXT NOT NULL DEFAULT '',
        parent_commit TEXT NOT NULL DEFAULT '',
        diff_hash TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        reviewer TEXT,
        rationale TEXT,
        parent_verification_id TEXT,
        FOREIGN KEY (parent_verification_id) REFERENCES verifications(id)
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_verifications_test_file
      ON verifications(test_file)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_verifications_status
      ON verifications(status)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_verifications_test_file_status
      ON verifications(test_file, status)
    `);
  }

  insert(record: VerificationRecord): void {
    this.db.run(
      `INSERT OR REPLACE INTO verifications
        (id, test_file, test_functions, rule, severity, status, commit_sha, parent_commit, diff_hash, created_at, updated_at, reviewer, rationale, parent_verification_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.testFile,
        JSON.stringify(record.testFunctions),
        record.rule,
        record.severity,
        record.status,
        record.commit,
        record.parentCommit,
        record.diffHash,
        record.createdAt,
        record.updatedAt,
        record.reviewer,
        record.rationale,
        record.parentVerificationId,
      ],
    );
  }

  updateStatus(
    id: string,
    status: StubStatus,
    reviewer?: string,
    rationale?: string,
  ): void {
    this.db.run(
      `UPDATE verifications
       SET status = ?, updated_at = ?, reviewer = ?, rationale = ?
       WHERE id = ?`,
      [status, new Date().toISOString(), reviewer ?? null, rationale ?? null, id],
    );
  }

  getById(id: string): VerificationRecord | null {
    const raw = this.db
      .query("SELECT * FROM verifications WHERE id = ?")
      .get(id);
    if (!raw) return null;
    return this.toRecord(parseRow(raw));
  }

  findByTestFile(testFile: string): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query("SELECT * FROM verifications WHERE test_file = ? ORDER BY created_at DESC")
        .all(testFile),
    );
    return rows.map((r) => this.toRecord(r));
  }

  findByTestFileAndFunction(
    testFile: string,
    testFunction: string,
  ): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query(
          `SELECT * FROM verifications
           WHERE test_file = ? AND test_functions LIKE ? ESCAPE '\\'
           ORDER BY created_at DESC`,
        )
        .all(testFile, `%${escapeLike(JSON.stringify(testFunction))}%`),
    );
    return rows.map((r) => this.toRecord(r));
  }

  findByStatus(status: StubStatus): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query("SELECT * FROM verifications WHERE status = ? ORDER BY created_at DESC")
        .all(status),
    );
    return rows.map((r) => this.toRecord(r));
  }

  findNeedsFixForTestFile(testFile: string): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query(
          `SELECT * FROM verifications
           WHERE test_file = ? AND status = 'needs_fix'
           ORDER BY created_at DESC`,
        )
        .all(testFile),
    );
    return rows.map((r) => this.toRecord(r));
  }

  findNeedsFixForTestFunction(
    testFile: string,
    testFunction: string,
  ): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query(
          `SELECT * FROM verifications
           WHERE test_file = ? AND status = 'needs_fix' AND test_functions LIKE ? ESCAPE '\\'
           ORDER BY created_at DESC`,
        )
        .all(testFile, `%${escapeLike(JSON.stringify(testFunction))}%`),
    );
    return rows.map((r) => this.toRecord(r));
  }

  getLineage(id: string): VerificationRecord[] {
    const chain: VerificationRecord[] = [];
    let current = this.getById(id);
    while (current) {
      chain.push(current);
      if (current.parentVerificationId) {
        current = this.getById(current.parentVerificationId);
      } else {
        break;
      }
    }
    return chain;
  }

  getChildren(parentId: string): VerificationRecord[] {
    const rows = parseRows(
      this.db
        .query(
          `SELECT * FROM verifications
           WHERE parent_verification_id = ?
           ORDER BY created_at ASC`,
        )
        .all(parentId),
    );
    return rows.map((r) => this.toRecord(r));
  }

  summary(): Record<StubStatus, number> {
    const rawRows = this.db
      .query("SELECT status, COUNT(*) as count FROM verifications GROUP BY status")
      .all();

    const result: Record<string, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      needs_fix: 0,
      resolved: 0,
    };
    for (const raw of rawRows) {
      const row = SummaryRowSchema.parse(raw);
      if (row.status in result) {
        result[row.status] = row.count;
      }
    }
    return result as Record<StubStatus, number>;
  }

  close(): void {
    this.db.close();
  }

  private toRecord(row: VerificationRow): VerificationRecord {
    const testFunctionsResult = z.array(z.string()).safeParse(
      JSON.parse(row.test_functions || "[]"),
    );
    if (!testFunctionsResult.success) {
      console.error(`  warn: corrupt test_functions JSON for ${row.id}, defaulting to []`);
    }

    return {
      id: row.id,
      testFile: row.test_file,
      testFunctions: testFunctionsResult.success ? testFunctionsResult.data : [],
      rule: row.rule,
      severity: SeveritySchema.parse(row.severity),
      status: StubStatusSchema.parse(row.status),
      commit: row.commit_sha ?? "",
      parentCommit: row.parent_commit,
      diffHash: row.diff_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewer: row.reviewer,
      rationale: row.rationale,
      parentVerificationId: row.parent_verification_id,
    };
  }
}
