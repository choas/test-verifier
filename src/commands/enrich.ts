import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config";
import { listByStatus, statusDir, auditDir } from "../audit-folder";
import { parseMarkdown } from "../markdown-reader";
import { getDiffBetweenCommits, getPriorCommitsDiff } from "../git";
import { createLlmClient } from "../llm";
import { AnalysisCache } from "../cache";
import type { LlmClient, LlmPromptInput, LlmResponse } from "../llm/types";

export async function enrich(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  const pendingFiles = await listByStatus(cwd, "pending");

  const stubs = pendingFiles.filter((f) => f.endsWith(".md"));
  if (stubs.length === 0) {
    console.log("test-verifier: no pending stubs to enrich.");
    return;
  }

  const pendingDir = statusDir(cwd, "pending");
  const toEnrich: { filename: string; raw: string }[] = [];

  for (const filename of stubs) {
    const filePath = join(pendingDir, filename);
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseMarkdown(raw);
    if (!parsed.stub.llm_enriched) {
      toEnrich.push({ filename, raw });
    }
  }

  if (toEnrich.length === 0) {
    console.log("test-verifier: all pending stubs already enriched.");
    return;
  }

  let client: LlmClient;
  try {
    client = createLlmClient(config);
  } catch (e) {
    console.error(`test-verifier: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  const cache = new AnalysisCache(auditDir(cwd), {
    maxAgeDays: config.audit.cacheTtlDays,
    maxEntries: config.audit.cacheMaxEntries,
  });
  let enrichedCount = 0;
  let errorCount = 0;

  try {
    for (const { filename, raw } of toEnrich) {
      const parsed = parseMarkdown(raw);
      const { stub } = parsed;

      try {
        const relatedProdDiff = await resolveRelatedProdDiffs(
          stub.commit,
          stub.parent_commit,
          stub.prod_files_related,
          config.llm.relatedProdLookback,
          cwd,
        );

        const cacheKey = AnalysisCache.computeKey(parsed.diff, relatedProdDiff, config.llm.model);
        let llmResponse = cache.get(cacheKey);

        if (!llmResponse) {
          const promptInput: LlmPromptInput = {
            testFilePath: stub.test_file,
            testDiff: parsed.diff,
            ruleFindings: parsed.findings.map((f) => ({
              rule: "rule-engine",
              severity: f.severity,
              message: f.message,
              line: 0,
            })),
            relatedProdDiffs: relatedProdDiff,
          };

          llmResponse = await analyzeWithRetry(client, promptInput);
          cache.set(cacheKey, llmResponse, config.llm.model);
        }

        const enrichedContent = rewriteWithAnalysis(raw, llmResponse, config.llm.model);
        await writeFile(join(pendingDir, filename), enrichedContent);
        enrichedCount++;
        console.log(`  enriched ${stub.test_file}`);
      } catch (e) {
        errorCount++;
        console.error(
          `  error enriching ${stub.test_file}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  } finally {
    cache.close();
  }

  console.log(`test-verifier: ${enrichedCount} file(s) enriched, ${errorCount} error(s).`);
  if (errorCount > 0) {
    process.exit(1);
  }
}

async function analyzeWithRetry(client: LlmClient, input: LlmPromptInput): Promise<LlmResponse> {
  try {
    return await client.analyze(input);
  } catch (firstError) {
    if (isMalformedResponseError(firstError) || isTimeoutError(firstError)) {
      return await client.analyze(input);
    }
    throw firstError;
  }
}

function isMalformedResponseError(e: unknown): boolean {
  if (e instanceof SyntaxError) return true;
  return typeof e === "object" && e !== null && "issues" in e;
}

function isTimeoutError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "TimeoutError") return true;
  return e instanceof Error && e.message === "The operation timed out.";
}

async function resolveRelatedProdDiffs(
  commit: string,
  parentCommit: string,
  prodFiles: string[],
  lookback: number,
  cwd: string,
): Promise<string> {
  if (prodFiles.length === 0) return "";

  const parts: string[] = [];

  try {
    const sameCommitDiff = await getDiffBetweenCommits(parentCommit, commit, prodFiles, cwd);
    if (sameCommitDiff) parts.push(sameCommitDiff);
  } catch (e) {
    console.error(
      `  warn: could not diff ${parentCommit.slice(0, 7)}..${commit.slice(0, 7)} for related prod files: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (lookback > 0) {
    try {
      const priorDiff = await getPriorCommitsDiff(commit, prodFiles, lookback, cwd);
      if (priorDiff) parts.push(priorDiff);
    } catch (e) {
      console.error(
        `  warn: could not get prior lookback diff for ${commit.slice(0, 7)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (parts.length === 0) {
    throw new Error(`Failed to resolve related prod diffs for: ${prodFiles.join(", ")}`);
  }

  return parts.join("\n");
}

function rewriteWithAnalysis(raw: string, response: LlmResponse, model: string): string {
  let result = raw.replace("llm_enriched: false", "llm_enriched: true");

  if (!result.includes("llm_model:")) {
    result = result.replace("llm_enriched: true\n", `llm_enriched: true\nllm_model: ${model}\n`);
  }

  const analysisHeader = "## Analysis\n\n";
  const decisionHeader = "\n## Decision";

  const analysisStart = result.indexOf(analysisHeader);
  const decisionStart = result.indexOf(decisionHeader, analysisStart);

  if (analysisStart === -1 || decisionStart === -1) {
    throw new Error("Could not find Analysis or Decision section in markdown");
  }

  const before = result.slice(0, analysisStart + analysisHeader.length);
  const after = result.slice(decisionStart);

  return `${before}${formatAnalysis(response)}\n${after}`;
}

function formatAnalysis(response: LlmResponse): string {
  const lines: string[] = [];

  lines.push(`**Summary:** ${response.summary}`);
  lines.push("");
  lines.push(`**Risk Assessment:** ${response.risk_assessment}`);

  if (response.concerns.length > 0) {
    lines.push("");
    lines.push("**Concerns:**");
    for (const concern of response.concerns) {
      lines.push(`- ${concern}`);
    }
  }

  lines.push("");
  lines.push(`**Recommendation:** ${response.recommendation}`);

  return lines.join("\n");
}
