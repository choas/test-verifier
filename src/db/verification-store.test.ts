import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { VerificationStore, type VerificationRecord } from "./verification-store";
import { Severity } from "../types";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeRecord(overrides?: Partial<VerificationRecord>): VerificationRecord {
  return {
    id: "tv_test_001",
    testFile: "src/utils.test.ts",
    testFunctions: ["adds numbers", "subtracts"],
    rule: "assertion-removal",
    severity: Severity.CRITICAL,
    status: "pending",
    commit: "abc1234",
    parentCommit: "def5678",
    diffHash: "sha256:aaa",
    createdAt: "2026-04-29T14:00:00Z",
    updatedAt: "2026-04-29T14:00:00Z",
    reviewer: null,
    rationale: null,
    parentVerificationId: null,
    ...overrides,
  };
}

describe("VerificationStore", () => {
  let tempDir: string;
  let store: VerificationStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "vs-test-"));
    store = new VerificationStore(tempDir);
  });

  afterEach(() => {
    store.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("getById returns null for nonexistent id", () => {
    expect(store.getById("nonexistent")).toBeNull();
  });

  test("insert and retrieve by id", () => {
    const record = makeRecord();
    store.insert(record);
    const result = store.getById("tv_test_001");
    expect(result).not.toBeNull();
    expect(result?.id).toBe("tv_test_001");
    expect(result?.testFile).toBe("src/utils.test.ts");
    expect(result?.testFunctions).toEqual(["adds numbers", "subtracts"]);
    expect(result?.severity).toBe(Severity.CRITICAL);
    expect(result?.status).toBe("pending");
    expect(result?.commit).toBe("abc1234");
  });

  test("insert replaces existing record with same id", () => {
    store.insert(makeRecord({ severity: Severity.LOW }));
    store.insert(makeRecord({ severity: Severity.CRITICAL }));
    const result = store.getById("tv_test_001");
    expect(result?.severity).toBe(Severity.CRITICAL);
  });

  test("updateStatus changes status and reviewer info", () => {
    store.insert(makeRecord());
    store.updateStatus("tv_test_001", "approved", "alice@test.com", "Looks good");
    const result = store.getById("tv_test_001");
    expect(result?.status).toBe("approved");
    expect(result?.reviewer).toBe("alice@test.com");
    expect(result?.rationale).toBe("Looks good");
  });

  test("findByTestFile returns matching records", () => {
    store.insert(makeRecord({ id: "tv_001", testFile: "src/a.test.ts" }));
    store.insert(makeRecord({ id: "tv_002", testFile: "src/a.test.ts" }));
    store.insert(makeRecord({ id: "tv_003", testFile: "src/b.test.ts" }));

    const results = store.findByTestFile("src/a.test.ts");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.testFile === "src/a.test.ts")).toBe(true);
  });

  test("findByTestFile returns empty for no matches", () => {
    store.insert(makeRecord());
    expect(store.findByTestFile("nonexistent.test.ts")).toHaveLength(0);
  });

  test("findByTestFileAndFunction matches function name in JSON array", () => {
    store.insert(
      makeRecord({
        id: "tv_001",
        testFunctions: ["adds numbers", "multiplies"],
      }),
    );
    store.insert(makeRecord({ id: "tv_002", testFunctions: ["subtracts"] }));

    const results = store.findByTestFileAndFunction("src/utils.test.ts", "adds numbers");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("tv_001");
  });

  test("findByStatus returns records with matching status", () => {
    store.insert(makeRecord({ id: "tv_001", status: "pending" }));
    store.insert(makeRecord({ id: "tv_002", status: "approved" }));
    store.insert(makeRecord({ id: "tv_003", status: "pending" }));

    const pending = store.findByStatus("pending");
    expect(pending).toHaveLength(2);

    const approved = store.findByStatus("approved");
    expect(approved).toHaveLength(1);
  });

  test("findNeedsFixForTestFile returns only needs_fix records", () => {
    store.insert(makeRecord({ id: "tv_001", status: "needs_fix" }));
    store.insert(makeRecord({ id: "tv_002", status: "pending" }));
    store.insert(makeRecord({ id: "tv_003", status: "needs_fix" }));

    const results = store.findNeedsFixForTestFile("src/utils.test.ts");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "needs_fix")).toBe(true);
  });

  test("findPendingForTestFile returns only pending records", () => {
    store.insert(makeRecord({ id: "tv_001", status: "pending" }));
    store.insert(makeRecord({ id: "tv_002", status: "needs_fix" }));
    store.insert(makeRecord({ id: "tv_003", status: "pending" }));

    const results = store.findPendingForTestFile("src/utils.test.ts");
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "pending")).toBe(true);
  });

  test("findNeedsFixForTestFunction filters by function name", () => {
    store.insert(
      makeRecord({
        id: "tv_001",
        status: "needs_fix",
        testFunctions: ["adds numbers"],
      }),
    );
    store.insert(
      makeRecord({
        id: "tv_002",
        status: "needs_fix",
        testFunctions: ["subtracts"],
      }),
    );

    const results = store.findNeedsFixForTestFunction("src/utils.test.ts", "adds numbers");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("tv_001");
  });

  test("getLineage follows parent chain", () => {
    store.insert(makeRecord({ id: "tv_001", parentVerificationId: null }));
    store.insert(makeRecord({ id: "tv_002", parentVerificationId: "tv_001" }));
    store.insert(makeRecord({ id: "tv_003", parentVerificationId: "tv_002" }));

    const lineage = store.getLineage("tv_003");
    expect(lineage).toHaveLength(3);
    expect(lineage[0].id).toBe("tv_003");
    expect(lineage[1].id).toBe("tv_002");
    expect(lineage[2].id).toBe("tv_001");
  });

  test("getLineage returns single record when no parent", () => {
    store.insert(makeRecord({ id: "tv_001" }));
    const lineage = store.getLineage("tv_001");
    expect(lineage).toHaveLength(1);
  });

  test("getChildren returns child records", () => {
    store.insert(makeRecord({ id: "tv_001" }));
    store.insert(makeRecord({ id: "tv_002", parentVerificationId: "tv_001" }));
    store.insert(makeRecord({ id: "tv_003", parentVerificationId: "tv_001" }));

    const children = store.getChildren("tv_001");
    expect(children).toHaveLength(2);
  });

  test("getChildren returns empty for no children", () => {
    store.insert(makeRecord({ id: "tv_001" }));
    expect(store.getChildren("tv_001")).toHaveLength(0);
  });

  test("summary returns counts by status", () => {
    store.insert(makeRecord({ id: "tv_001", status: "pending" }));
    store.insert(makeRecord({ id: "tv_002", status: "pending" }));
    store.insert(makeRecord({ id: "tv_003", status: "approved" }));
    store.insert(makeRecord({ id: "tv_004", status: "rejected" }));

    const summary = store.summary();
    expect(summary.pending).toBe(2);
    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(1);
    expect(summary.needs_fix).toBe(0);
    expect(summary.resolved).toBe(0);
  });

  test("summary returns all zeros for empty store", () => {
    const summary = store.summary();
    expect(summary.pending).toBe(0);
    expect(summary.approved).toBe(0);
    expect(summary.rejected).toBe(0);
    expect(summary.needs_fix).toBe(0);
    expect(summary.resolved).toBe(0);
  });

  test("handles non-ASCII content in test file and function names", () => {
    store.insert(
      makeRecord({
        id: "tv_unicode",
        testFile: "src/国際化.test.ts",
        testFunctions: ["日本語テスト", "Ünïcödé test"],
      }),
    );

    const result = store.getById("tv_unicode");
    expect(result?.testFile).toBe("src/国際化.test.ts");
    expect(result?.testFunctions).toEqual(["日本語テスト", "Ünïcödé test"]);
  });

  test("handles empty test_functions array", () => {
    store.insert(makeRecord({ id: "tv_empty", testFunctions: [] }));
    const result = store.getById("tv_empty");
    expect(result?.testFunctions).toEqual([]);
  });
});
