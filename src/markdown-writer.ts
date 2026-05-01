import { createHash } from "node:crypto";
import type { RuleEngineResult } from "./rule-engine";
import type { Finding, StubFile } from "./types";

export interface MarkdownWriterInput {
  ruleResult: RuleEngineResult;
  commit: string;
  parentCommit: string;
  rawDiff: string;
  prodFilesRelated?: string[];
  testFunctions?: string[];
  parentVerificationId?: string;
  createdAt?: Date;
}

export interface MarkdownWriterOutput {
  filename: string;
  content: string;
  stub: StubFile;
}

export function generateStubMarkdown(input: MarkdownWriterInput): MarkdownWriterOutput {
  const {
    ruleResult,
    commit,
    parentCommit,
    rawDiff,
    prodFilesRelated = [],
    testFunctions = [],
    parentVerificationId,
    createdAt = new Date(),
  } = input;

  const timestamp = formatTimestamp(createdAt);
  const shortSha = commit.slice(0, 7);
  const testFileSanitized = sanitizeTestFilePath(ruleResult.filePath);
  const filename = `${timestamp}_${shortSha}_${testFileSanitized}.md`;
  const id = `tv_${timestamp}_${shortSha}_${testFileSanitized}`;
  const diffHash = computeDiffHash(rawDiff);

  const stub: StubFile = {
    id,
    created_at: createdAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
    severity: ruleResult.overallSeverity,
    status: "pending",
    llm_enriched: false,
    test_file: ruleResult.filePath,
    test_functions: testFunctions,
    prod_files_related: prodFilesRelated,
    commit,
    parent_commit: parentCommit,
    diff_hash: diffHash,
    parent_verification_id: parentVerificationId,
  };

  const content = renderMarkdown(stub, ruleResult.findings, rawDiff);

  return { filename, content, stub };
}

export function formatTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}-${mi}`;
}

export function sanitizeTestFilePath(filePath: string): string {
  let name = filePath.replace(/\\/g, "/");
  name = name.replace(/\.(test|spec)(\.svelte)?\.[tj]sx?$/, "");
  name = name.replace(/[^a-zA-Z0-9-]/g, "-");
  name = name.replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!name.endsWith("-test")) {
    name += "-test";
  }
  return name;
}

function computeDiffHash(rawDiff: string): string {
  const hash = createHash("sha256").update(rawDiff).digest("hex");
  return `sha256:${hash}`;
}

function renderFinding(finding: Finding): string {
  return `- **${finding.severity}** ${finding.message}`;
}

function renderMarkdown(stub: StubFile, findings: Finding[], rawDiff: string): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`id: ${stub.id}`);
  lines.push(`created_at: ${stub.created_at}`);
  lines.push(`severity: ${stub.severity}`);
  lines.push(`status: ${stub.status}`);
  lines.push(`llm_enriched: ${stub.llm_enriched}`);
  lines.push(`test_file: ${JSON.stringify(stub.test_file)}`);
  if (stub.test_functions.length > 0) {
    lines.push("test_functions:");
    for (const f of stub.test_functions) {
      lines.push(`  - ${JSON.stringify(f)}`);
    }
  } else {
    lines.push("test_functions: []");
  }
  if (stub.parent_verification_id) {
    lines.push(`parent_verification_id: ${stub.parent_verification_id}`);
  }
  if (stub.prod_files_related.length > 0) {
    lines.push("prod_files_related:");
    for (const f of stub.prod_files_related) {
      lines.push(`  - ${JSON.stringify(f)}`);
    }
  } else {
    lines.push("prod_files_related: []");
  }
  lines.push(`commit: ${stub.commit}`);
  lines.push(`parent_commit: ${stub.parent_commit}`);
  lines.push(`diff_hash: ${stub.diff_hash}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Test change in \`${stub.test_file}\``);
  lines.push("");
  lines.push("## Findings (rule engine)");
  lines.push("");
  if (findings.length > 0) {
    for (const f of findings) {
      lines.push(renderFinding(f));
    }
  } else {
    lines.push("No findings.");
  }
  lines.push("");
  lines.push("## Diff");
  lines.push("");
  lines.push("```diff");
  lines.push(rawDiff);
  lines.push("```");
  lines.push("");
  lines.push("## Analysis");
  lines.push("");
  lines.push("(Pending LLM enrichment. Run `bunx test-verifier enrich`.)");
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push("(Empty until enrichment is complete and a human approves or rejects.)");
  lines.push("");

  return lines.join("\n");
}
