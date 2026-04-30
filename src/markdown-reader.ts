import matter from "gray-matter";
import { Severity, type StubFile, type StubStatus } from "./types";

export interface ParsedFinding {
  severity: Severity;
  message: string;
}

export interface ParsedMarkdown {
  stub: StubFile;
  findings: ParsedFinding[];
  diff: string;
  analysis: string;
  decision: string;
}

const VALID_SEVERITIES = new Set(Object.values(Severity));
const VALID_STATUSES = new Set<string>(["pending", "approved", "rejected"]);

export function parseMarkdown(raw: string): ParsedMarkdown {
  const { data, content } = matter(raw);

  const stub = parseFrontMatter(data);
  const sections = parseSections(content);

  return {
    stub,
    findings: parseFindings(sections.findings),
    diff: parseDiff(sections.diff),
    analysis: sections.analysis.trim(),
    decision: sections.decision.trim(),
  };
}

function stringifyDate(val: unknown): string {
  if (val instanceof Date) {
    return val.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return String(val ?? "");
}

function parseFrontMatter(data: Record<string, unknown>): StubFile {
  const severity = String(data.severity ?? "");
  if (!VALID_SEVERITIES.has(severity as Severity)) {
    throw new Error(`Invalid severity in front matter: ${severity}`);
  }

  const status = String(data.status ?? "");
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Invalid status in front matter: ${status}`);
  }

  const prodFiles = data.prod_files_related;
  let prodFilesRelated: string[];
  if (Array.isArray(prodFiles)) {
    prodFilesRelated = prodFiles.map(String);
  } else if (prodFiles == null || prodFiles === "") {
    prodFilesRelated = [];
  } else {
    prodFilesRelated = [String(prodFiles)];
  }

  return {
    id: String(data.id ?? ""),
    created_at: stringifyDate(data.created_at),
    severity: severity as Severity,
    status: status as StubStatus,
    llm_enriched: Boolean(data.llm_enriched),
    test_file: String(data.test_file ?? ""),
    prod_files_related: prodFilesRelated,
    commit: String(data.commit ?? ""),
    parent_commit: String(data.parent_commit ?? ""),
    diff_hash: String(data.diff_hash ?? ""),
  };
}

const FINDING_RE = /^- \*\*(\w+)\*\* (.+)$/;

function parseFindings(text: string): ParsedFinding[] {
  const findings: ParsedFinding[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(FINDING_RE);
    if (!match) continue;
    const [, severity, message] = match;
    if (!VALID_SEVERITIES.has(severity as Severity)) continue;
    findings.push({ severity: severity as Severity, message });
  }
  return findings;
}

function parseDiff(text: string): string {
  const fenceStart = text.indexOf("```diff\n");
  if (fenceStart === -1) return "";
  const contentStart = fenceStart + "```diff\n".length;
  const fenceEnd = text.indexOf("\n```", contentStart);
  if (fenceEnd === -1) return text.slice(contentStart).trimEnd();
  return text.slice(contentStart, fenceEnd);
}

function parseSections(body: string): {
  findings: string;
  diff: string;
  analysis: string;
  decision: string;
} {
  const result = { findings: "", diff: "", analysis: "", decision: "" };
  const headerRe = /^## (.+)$/gm;
  const headers: { name: string; start: number; end: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = headerRe.exec(body)) !== null) {
    if (headers.length > 0) {
      headers[headers.length - 1].end = match.index;
    }
    headers.push({ name: match[1], start: match.index + match[0].length, end: body.length });
  }

  for (const h of headers) {
    const content = body.slice(h.start, h.end);
    const name = h.name.toLowerCase();
    if (name.startsWith("findings")) {
      result.findings = content;
    } else if (name === "diff") {
      result.diff = content;
    } else if (name === "analysis") {
      result.analysis = content;
    } else if (name === "decision") {
      result.decision = content;
    }
  }

  return result;
}
