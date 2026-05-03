import type { FileDiff } from "../diff-parser";
import { Severity, type Finding } from "../types";

export interface SnapshotConfig {
  inline: Severity;
  pairedUpdate: Severity;
  unpairedUpdate: Severity;
  deletion: Severity;
  maxDiffSizeForLLM: number;
  truncationStrategy: "head-tail" | "sample" | "summary";
}

const DEFAULT_CONFIG: SnapshotConfig = {
  inline: Severity.SUSPICIOUS,
  pairedUpdate: Severity.SUSPICIOUS,
  unpairedUpdate: Severity.CRITICAL,
  deletion: Severity.CRITICAL,
  maxDiffSizeForLLM: 10_000,
  truncationStrategy: "head-tail",
};

const INLINE_SNAPSHOT_RE = /\.(toMatchInlineSnapshot|toThrowErrorMatchingInlineSnapshot)\s*\(/;

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx|mts|mjs|svelte\.ts)$/;

export function isSnapFile(path: string): boolean {
  return path.endsWith(".snap");
}

export function isTestFile(path: string): boolean {
  return TEST_FILE_RE.test(path) || /\/__tests__\//.test(path);
}

function isFileDeleted(diff: FileDiff): boolean {
  return (
    diff.hunks.some((h) => h.lines.some((l) => l.type === "removed")) &&
    !diff.hunks.some((h) => h.lines.some((l) => l.type === "added")) &&
    !diff.hunks.some((h) => h.lines.some((l) => l.type === "context"))
  );
}

export function findPairedTestFile(snapPath: string, changedTestPaths: Set<string>): string | null {
  let candidate = snapPath.replace(/\.snap$/, "");
  candidate = candidate.replace(/(^|\/)__snapshots__\//, "$1");

  if (changedTestPaths.has(candidate)) return candidate;

  const baseName = candidate.split("/").pop() ?? "";
  for (const tp of changedTestPaths) {
    const tpBase = tp.split("/").pop() ?? "";
    if (tpBase === baseName) return tp;
  }

  return null;
}

function detectInlineChanges(diff: FileDiff, severity: Severity): Finding[] {
  const findings: Finding[] = [];

  for (const hunk of diff.hunks) {
    const removedInMatcher = hunk.lines.some(
      (l) => l.type === "removed" && INLINE_SNAPSHOT_RE.test(l.content),
    );
    const addedInMatcher = hunk.lines.some(
      (l) => l.type === "added" && INLINE_SNAPSHOT_RE.test(l.content),
    );
    const contextMatcher = hunk.lines.some(
      (l) => l.type === "context" && INLINE_SNAPSHOT_RE.test(l.content),
    );

    const hasRemovals = hunk.lines.some((l) => l.type === "removed");
    const hasAdditions = hunk.lines.some((l) => l.type === "added");

    const isChange =
      (removedInMatcher && addedInMatcher) || (contextMatcher && hasRemovals && hasAdditions);

    if (!isChange) continue;

    const matcherLine = hunk.lines.find((l) => INLINE_SNAPSHOT_RE.test(l.content));
    const lineNum = matcherLine?.newLineNumber ?? matcherLine?.oldLineNumber ?? hunk.newStart;

    const before = hunk.lines
      .filter((l) => l.type === "removed")
      .map((l) => l.content)
      .join("\n")
      .trim();

    const after = hunk.lines
      .filter((l) => l.type === "added")
      .map((l) => l.content)
      .join("\n")
      .trim();

    findings.push({
      rule: "snapshot/inline-change",
      severity,
      line: lineNum,
      message: `Inline snapshot changed in "${diff.newPath}"`,
      before,
      after,
    });
  }

  return findings;
}

function extractLines(diff: FileDiff, type: "removed" | "added"): string {
  return diff.hunks
    .flatMap((h) => h.lines)
    .filter((l) => l.type === type)
    .map((l) => l.content)
    .join("\n");
}

function firstChangedLine(diff: FileDiff): number {
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "added" && line.newLineNumber !== null) return line.newLineNumber;
      if (line.type === "removed" && line.oldLineNumber !== null) return line.oldLineNumber;
    }
  }
  return 1;
}

// --- Truncation ---

export interface TruncationResult {
  before: string;
  after: string;
  truncated: boolean;
}

export function truncateHeadTail(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text;
  const marker = "\n[... truncated ...]\n";
  const half = Math.floor((maxSize - marker.length) / 2);
  if (half <= 0) return text.slice(0, maxSize);
  return text.slice(0, half) + marker + text.slice(-half);
}

export function truncateSample(lines: string[], maxSize: number): string {
  if (lines.length === 0) return "";
  const full = lines.join("\n");
  if (full.length <= maxSize) return full;

  const result: string[] = [];
  let currentSize = 0;
  const avgLineLen = Math.max(1, Math.ceil(full.length / lines.length));
  const targetLines = Math.max(1, Math.floor(maxSize / avgLineLen));
  const step = Math.max(1, Math.floor(lines.length / targetLines));

  for (let i = 0; i < lines.length; i += step) {
    if (currentSize + lines[i].length + 1 > maxSize) break;
    result.push(lines[i]);
    currentSize += lines[i].length + 1;
  }

  const skipped = lines.length - result.length;
  if (skipped > 0) {
    result.push(`[... ${skipped} lines sampled out ...]`);
  }
  return result.join("\n");
}

export function truncateSummary(lines: string[], totalBytes: number): string {
  return `[${lines.length} lines, ${totalBytes} bytes]`;
}

export function truncateDiff(
  before: string,
  after: string,
  maxSize: number,
  strategy: "head-tail" | "sample" | "summary",
): TruncationResult {
  const totalSize = before.length + after.length;

  if (totalSize <= maxSize) {
    return { before, after, truncated: false };
  }

  const beforeRatio = totalSize > 0 ? before.length / totalSize : 0.5;
  const beforeBudget = Math.floor(maxSize * beforeRatio);
  const afterBudget = maxSize - beforeBudget;

  switch (strategy) {
    case "head-tail":
      return {
        before: truncateHeadTail(before, beforeBudget),
        after: truncateHeadTail(after, afterBudget),
        truncated: true,
      };
    case "sample":
      return {
        before: truncateSample(before.split("\n"), beforeBudget),
        after: truncateSample(after.split("\n"), afterBudget),
        truncated: true,
      };
    case "summary":
      return {
        before: truncateSummary(before.split("\n"), before.length),
        after: truncateSummary(after.split("\n"), after.length),
        truncated: true,
      };
  }
}

// --- Main ---

export function detectSnapshotChanges(
  diffs: FileDiff[],
  config: Partial<SnapshotConfig> = {},
): Finding[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const findings: Finding[] = [];

  const snapDiffs = diffs.filter((d) => isSnapFile(d.newPath) || isSnapFile(d.oldPath));
  const testDiffs = diffs.filter((d) => isTestFile(d.newPath) || isTestFile(d.oldPath));
  const changedTestPaths = new Set<string>();
  for (const d of testDiffs) {
    changedTestPaths.add(d.newPath);
    if (d.oldPath !== d.newPath) changedTestPaths.add(d.oldPath);
  }

  for (const testDiff of testDiffs) {
    findings.push(...detectInlineChanges(testDiff, cfg.inline));
  }

  for (const snapDiff of snapDiffs) {
    if (isFileDeleted(snapDiff)) {
      const content = extractLines(snapDiff, "removed");
      const truncated = truncateDiff(content, "", cfg.maxDiffSizeForLLM, cfg.truncationStrategy);
      findings.push({
        rule: "snapshot/deletion",
        severity: cfg.deletion,
        line: 1,
        message: `Snapshot file "${snapDiff.oldPath}" was deleted entirely`,
        before: truncated.before,
        after: "",
      });
      continue;
    }

    const snapPath = snapDiff.newPath || snapDiff.oldPath;
    const paired = findPairedTestFile(snapPath, changedTestPaths);
    const beforeContent = extractLines(snapDiff, "removed");
    const afterContent = extractLines(snapDiff, "added");
    const truncated = truncateDiff(
      beforeContent,
      afterContent,
      cfg.maxDiffSizeForLLM,
      cfg.truncationStrategy,
    );

    if (paired) {
      findings.push({
        rule: "snapshot/paired-update",
        severity: cfg.pairedUpdate,
        line: firstChangedLine(snapDiff),
        message: `Snapshot file "${snapPath}" changed alongside test code "${paired}"`,
        before: truncated.before,
        after: truncated.after,
      });
    } else {
      findings.push({
        rule: "snapshot/unpaired-update",
        severity: cfg.unpairedUpdate,
        line: firstChangedLine(snapDiff),
        message: `Snapshot file "${snapPath}" changed with no corresponding test code change`,
        before: truncated.before,
        after: truncated.after,
      });
    }
  }

  return findings;
}
