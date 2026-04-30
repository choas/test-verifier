import { Severity, type Finding } from "../types";
import {
  extractTestBlocksPair,
  extractTestBlocks,
  type TestBlock,
  type Assertion,
} from "../test-block-extractor";

export interface SafeClassifierInput {
  beforeSource: string;
  afterSource: string;
  filePath?: string;
}

export function classifySafeChanges(input: SafeClassifierInput): Finding[] {
  const { beforeSource, afterSource } = input;

  if (beforeSource === afterSource) return [];
  if (!beforeSource.trim() && !afterSource.trim()) return [];

  if (!beforeSource.trim()) return classifyNewTestFile(afterSource, input.filePath);
  if (!afterSource.trim()) return [];

  if (isFormattingOnly(beforeSource, afterSource)) {
    return [{
      rule: "safe/formatting-only",
      severity: Severity.SAFE,
      line: 1,
      message: "Changes are formatting-only (whitespace, semicolons, trailing commas)",
      before: "",
      after: "",
    }];
  }

  if (isTypeAnnotationOnly(beforeSource, afterSource)) {
    return [{
      rule: "safe/type-annotation-only",
      severity: Severity.SAFE,
      line: 1,
      message: "Changes only add or modify type annotations",
      before: "",
      after: "",
    }];
  }

  const renameResult = detectIdentifierRename(beforeSource, afterSource);
  if (renameResult) return [renameResult];

  return classifyTestBlockChanges(input);
}

// ---------- New test file ----------

function classifyNewTestFile(source: string, filePath?: string): Finding[] {
  const blocks = extractTestBlocks(source, filePath);
  if (blocks.length === 0) return [];

  return [{
    rule: "safe/new-test-file",
    severity: Severity.SAFE,
    line: 1,
    message: `New test file with ${countTests(blocks)} test(s)`,
    before: "",
    after: "",
  }];
}

function countTests(blocks: TestBlock[]): number {
  let count = 0;
  for (const block of blocks) {
    if (block.type === "it" || block.type === "test") count++;
    count += countTests(block.children);
  }
  return count;
}

// ---------- Formatting ----------

function normalizeFormatting(source: string): string {
  return source
    .replace(/\s*;\s*/g, " ")
    .replace(/,\s*([}\])])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/ (?=[^a-zA-Z0-9_$])/g, "")
    .replace(/(?<=[^a-zA-Z0-9_$]) /g, "")
    .trim();
}

function isFormattingOnly(before: string, after: string): boolean {
  return normalizeFormatting(before) === normalizeFormatting(after);
}

// ---------- Type annotations ----------

function stripTypeAnnotations(source: string): string {
  return source
    .replace(/^\s*import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, "")
    .replace(/^\s*(export\s+)?type\s+\w+\s*=\s*[^;]+;\s*$/gm, "")
    .replace(/((?:const|let|var)\s+)(\w+)\s*:\s*[^=\n]+(?=\s*=)/g, "$1$2")
    .replace(/(\))\s*:\s*[^=>{}\n]+(?=\s*(?:=>|\{))/g, "$1");
}

function isTypeAnnotationOnly(before: string, after: string): boolean {
  return (
    normalizeFormatting(stripTypeAnnotations(before)) ===
    normalizeFormatting(stripTypeAnnotations(after))
  );
}

// ---------- Identifier rename ----------

function detectIdentifierRename(before: string, after: string): Finding | null {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  if (beforeLines.length !== afterLines.length) return null;

  const ID_RE = /\b([a-zA-Z_$][\w$]*)\b/g;
  const renameMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();

  for (let i = 0; i < beforeLines.length; i++) {
    if (beforeLines[i] === afterLines[i]) continue;

    const bWords = [...beforeLines[i].matchAll(new RegExp(ID_RE.source, "g"))];
    const aWords = [...afterLines[i].matchAll(new RegExp(ID_RE.source, "g"))];
    if (bWords.length !== aWords.length) return null;

    const bStructure = beforeLines[i].replace(new RegExp(ID_RE.source, "g"), "\0");
    const aStructure = afterLines[i].replace(new RegExp(ID_RE.source, "g"), "\0");
    if (bStructure !== aStructure) return null;

    for (let j = 0; j < bWords.length; j++) {
      const bw = bWords[j][1];
      const aw = aWords[j][1];
      if (bw === aw) continue;

      if (renameMap.has(bw) && renameMap.get(bw) !== aw) return null;
      if (reverseMap.has(aw) && reverseMap.get(aw) !== bw) return null;

      renameMap.set(bw, aw);
      reverseMap.set(aw, bw);
    }
  }

  if (renameMap.size === 0) return null;

  for (const [oldName] of renameMap) {
    if (new RegExp(`(?<![.\\w$])${escapeRegExp(oldName)}\\s*\\(`).test(before)) return null;
    if (new RegExp(`\\.\\s*${escapeRegExp(oldName)}\\b`).test(before)) return null;
    if (appearsInString(before, oldName)) return null;
  }

  const transformed = before.replace(
    new RegExp(ID_RE.source, "g"),
    (m) => renameMap.get(m) ?? m,
  );
  if (transformed !== after) return null;

  const renames = [...renameMap.entries()];
  return {
    rule: "safe/identifier-rename",
    severity: Severity.SAFE,
    line: 1,
    message: `Identifier rename: ${renames.map(([k, v]) => `${k} → ${v}`).join(", ")}`,
    before: "",
    after: "",
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appearsInString(source: string, word: string): boolean {
  const escaped = escapeRegExp(word);
  return (
    new RegExp(`'[^'\\\\]*\\b${escaped}\\b[^'\\\\]*'`).test(source) ||
    new RegExp(`"[^"\\\\]*\\b${escaped}\\b[^"\\\\]*"`).test(source)
  );
}

// ---------- Test block changes ----------

interface FlatTest {
  qualifiedName: string;
  startLine: number;
  assertions: Assertion[];
  body: string;
}

function flattenTests(blocks: TestBlock[], parentPath = ""): FlatTest[] {
  const result: FlatTest[] = [];
  for (const block of blocks) {
    const name = parentPath ? `${parentPath} > ${block.name}` : block.name;
    if (block.type === "describe") {
      result.push(...flattenTests(block.children, name));
    } else {
      result.push({
        qualifiedName: name,
        startLine: block.startLine,
        assertions: block.assertions,
        body: block.body,
      });
    }
  }
  return result;
}

function normalizeAssertionText(text: string): string {
  return text.replace(/\s+/g, "");
}

function isAdditionOnly(before: string, after: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const beforeLines = before.split("\n").map(norm).filter((l) => l);
  const afterLines = after.split("\n").map(norm).filter((l) => l);

  let j = 0;
  for (const bLine of beforeLines) {
    while (j < afterLines.length && afterLines[j] !== bLine) j++;
    if (j >= afterLines.length) return false;
    j++;
  }
  return true;
}

function classifyTestBlockChanges(input: SafeClassifierInput): Finding[] {
  const { before, after } = extractTestBlocksPair(
    input.beforeSource,
    input.afterSource,
    input.filePath,
  );

  const flatBefore = flattenTests(before);
  const flatAfter = flattenTests(after);

  const beforeByName = new Map<string, FlatTest>();
  for (const t of flatBefore) beforeByName.set(t.qualifiedName, t);

  const afterByName = new Map<string, FlatTest>();
  for (const t of flatAfter) afterByName.set(t.qualifiedName, t);

  for (const [name] of beforeByName) {
    if (!afterByName.has(name)) return [];
  }

  const newTests: FlatTest[] = [];
  for (const [name, t] of afterByName) {
    if (!beforeByName.has(name)) newTests.push(t);
  }

  let hasNewAssertions = false;
  for (const [, oldTest] of beforeByName) {
    const newTest = afterByName.get(oldTest.qualifiedName)!;

    const newAssertionSet = new Set(
      newTest.assertions.map((a) => normalizeAssertionText(a.text)),
    );
    for (const a of oldTest.assertions) {
      if (!newAssertionSet.has(normalizeAssertionText(a.text))) return [];
    }

    const oldAssertionSet = new Set(
      oldTest.assertions.map((a) => normalizeAssertionText(a.text)),
    );
    if (newTest.assertions.some((a) => !oldAssertionSet.has(normalizeAssertionText(a.text)))) {
      hasNewAssertions = true;
    }

    if (!isAdditionOnly(oldTest.body, newTest.body)) return [];
  }

  if (!isAdditionOnly(input.beforeSource, input.afterSource)) return [];

  if (newTests.length === 0 && !hasNewAssertions) return [];

  const findings: Finding[] = [];

  if (newTests.length > 0) {
    findings.push({
      rule: "safe/new-test-block",
      severity: Severity.SAFE,
      line: newTests[0].startLine,
      message: `${newTests.length} new test(s) added without modifying existing tests`,
      before: "",
      after: "",
    });
  }

  if (hasNewAssertions) {
    findings.push({
      rule: "safe/new-assertion",
      severity: Severity.SAFE,
      line: 1,
      message: "New assertions added to existing test(s) without removing any",
      before: "",
      after: "",
    });
  }

  return findings;
}
