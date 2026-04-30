import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../config";
import { ensureAuditDir, statusDir, auditDir } from "../audit-folder";
import { parseMarkdown } from "../markdown-reader";
import { writeFile } from "node:fs/promises";

interface CompactOptions {
  period?: "month" | "quarter" | "year";
  before?: string;
  delete?: boolean;
}

function parseArgs(argv: string[]): CompactOptions {
  const opts: CompactOptions = {};
  for (const arg of argv) {
    if (arg.startsWith("--period=")) {
      opts.period = arg.slice("--period=".length) as CompactOptions["period"];
    } else if (arg.startsWith("--before=")) {
      opts.before = arg.slice("--before=".length);
    } else if (arg === "--delete") {
      opts.delete = true;
    }
  }
  return opts;
}

function periodLabel(date: Date, period: "month" | "quarter" | "year"): string {
  const y = date.getUTCFullYear();
  if (period === "year") return `${y}`;
  if (period === "quarter") {
    const q = Math.ceil((date.getUTCMonth() + 1) / 3);
    return `${y}-Q${q}`;
  }
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface ArchiveEntry {
  createdAt: string;
  severity: string;
  testFile: string;
  commit: string;
  findingSummary: string;
  filename: string;
}

export async function auditCompact(cwd: string = process.cwd()): Promise<void> {
  const config = await loadConfig(cwd);
  await ensureAuditDir(cwd);

  const cliArgs = Bun.argv.slice(4);
  const opts = parseArgs(cliArgs);

  const period = opts.period ?? config.audit.compactPeriod;
  if (period === "never") {
    console.log("test-verifier: compaction disabled (compactPeriod=never).");
    return;
  }

  if (!opts.before) {
    console.error("test-verifier: --before=YYYY-MM-DD is required.");
    process.exit(1);
  }

  const cutoff = new Date(opts.before);
  if (isNaN(cutoff.getTime())) {
    console.error(`test-verifier: invalid date '${opts.before}'.`);
    process.exit(1);
  }

  const approvedDir = statusDir(cwd, "approved");
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(approvedDir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".md"))
    .sort();

  const entries: ArchiveEntry[] = [];

  for (const filename of files) {
    const filePath = join(approvedDir, filename);
    const raw = await readFile(filePath, "utf-8");
    const parsed = parseMarkdown(raw);
    const createdAt = new Date(parsed.stub.created_at);

    if (isNaN(createdAt.getTime()) || createdAt >= cutoff) continue;

    const topFinding = parsed.findings[0];
    const findingSummary = topFinding
      ? `${topFinding.severity}: ${topFinding.message}`
      : parsed.stub.severity;

    entries.push({
      createdAt: parsed.stub.created_at,
      severity: parsed.stub.severity,
      testFile: parsed.stub.test_file,
      commit: parsed.stub.commit.slice(0, 7),
      findingSummary,
      filename,
    });
  }

  if (entries.length === 0) {
    console.log("test-verifier: no approved files older than cutoff.");
    return;
  }

  const grouped = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    const label = periodLabel(new Date(entry.createdAt), period);
    const list = grouped.get(label) ?? [];
    list.push(entry);
    grouped.set(label, list);
  }

  const archiveBaseDir = join(auditDir(cwd), "archive");

  let archivedTotal = 0;

  for (const [label, group] of grouped) {
    const lines = [
      `# Archive: ${label}`,
      "",
      `| Date | Severity | Test file | Commit | Finding |`,
      `|------|----------|-----------|--------|---------|`,
    ];
    for (const e of group) {
      const date = e.createdAt.slice(0, 10);
      lines.push(`| ${date} | ${e.severity} | ${e.testFile} | ${e.commit} | ${e.findingSummary} |`);
    }
    lines.push("");

    const archivePath = join(archiveBaseDir, `${label}.md`);
    await writeFile(archivePath, lines.join("\n"));
    console.log(`  wrote ${archivePath} (${group.length} entries)`);
    archivedTotal += group.length;
  }

  if (opts.delete) {
    for (const entry of entries) {
      await unlink(join(approvedDir, entry.filename));
    }
    console.log(`test-verifier: deleted ${entries.length} original(s).`);
  }

  console.log(
    `test-verifier: compacted ${archivedTotal} approved file(s) into ${grouped.size} archive(s).`,
  );
}
