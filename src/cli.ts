#!/usr/bin/env bun

import { parseArgs } from "node:util";

const VERSION = "0.0.1";

const USAGE = `test-verifier v${VERSION}

Usage: test-verifier <command> [options]

Commands:
  init                Initialize test-verifier for this repository
  check [--staged|--uncommitted] [--verbose]
                      Analyze test changes and generate findings
                        --staged       Check staged (index) changes vs HEAD
                        --uncommitted  Check all uncommitted changes vs HEAD
                        --verbose      Show which files are being checked
  list [--status <s>] [--all]
                      List findings (default: unresolved only)
                        --status <s>   Filter by status (pending|needs_fix|rejected|approved|resolved)
                        --all          Show all findings including resolved
  enrich              Enrich pending findings with LLM analysis
  review [--approve-safe]
                      Interactively review pending findings
                        --approve-safe Auto-approve findings where LLM risk is SAFE
  approve <id>        Approve a pending finding
  reject <id>         Reject a pending finding
  needs-fix <id>      Mark a finding as needing a fix (blocks push)
                        --all  Mark all pending findings as needs-fix
  history <file>      Show verification history for a test file
                        --function <name>  Filter by test function name
  commit              Commit .test-verifier/ changes with a descriptive message
  sync                Rebuild local database from .test-verifier/ markdown files
  audit verify        Verify audit trail integrity
  audit compact       Compact old approved findings into archives
  setup-hooks         Install git hooks (pre-commit, pre-push)
  test-llm [--prompt <text>]
                      Send a test prompt to the configured LLM
                        --prompt  Custom prompt text (default: a test-analysis prompt)

Options:
  -h, --help          Show help
  -v, --version       Show version`;

const AUDIT_USAGE = `Usage: test-verifier audit <subcommand>

Subcommands:
  verify [--no-pending] [--no-rejected] [--signatures]
      Verify audit trail integrity

  compact --before=YYYY-MM-DD [--period=month|quarter|year] [--delete]
      Compact old approved findings into archives`;

const APPROVE_USAGE = `Usage: test-verifier approve <finding-id> --rationale <text>`;
const REJECT_USAGE = `Usage: test-verifier reject <finding-id> --rationale <text>`;
const NEEDS_FIX_USAGE = `Usage: test-verifier needs-fix <finding-id> --rationale <text>\n       test-verifier needs-fix --all --rationale <text>`;
const HISTORY_USAGE = `Usage: test-verifier history <test-file> [--function <name>]`;

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
      );
  return dp[m][n];
}

function suggestOption(unknown: string, known: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const opt of known) {
    const d = levenshtein(unknown, opt);
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = opt;
    }
  }
  return best;
}

function handleParseError(e: unknown, knownOptions: string[]): never {
  if (e instanceof TypeError) {
    const match = e.message.match(/Unknown option '(--.+?)'/);
    if (match) {
      console.error(`Error: Unknown option '${match[1]}'`);
      const suggestion = suggestOption(match[1], knownOptions);
      if (suggestion) {
        console.error(`Did you mean '${suggestion}'?`);
      }
    } else {
      console.error(`Error: ${e.message}`);
    }
    process.exit(1);
  }
  throw e;
}

const args = Bun.argv.slice(2);

const { values: globalFlags, positionals } = parseArgs({
  args,
  options: {
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
  strict: false,
});

const cmdIndex = args.findIndex((a) => !a.startsWith("-"));
const preCommandArgs = args.slice(0, cmdIndex === -1 ? args.length : cmdIndex);
for (const arg of preCommandArgs) {
  if (arg.startsWith("--") && arg.slice(2) !== "help" && arg.slice(2) !== "version") {
    console.error(`Error: Unknown option '${arg}'`);
    process.exit(1);
  }
  if (arg.startsWith("-") && !arg.startsWith("--") && arg !== "-h" && arg !== "-v") {
    console.error(`Error: Unknown option '${arg}'`);
    process.exit(1);
  }
}

if (globalFlags.version) {
  console.log(VERSION);
  process.exit(0);
}

const command = positionals[0];

if (globalFlags.help) {
  console.log(USAGE);
  process.exit(0);
}

if (!command) {
  console.log(USAGE);
  process.exit(1);
}

switch (command) {
  case "init": {
    const { init } = await import("./commands/init");
    await init();
    break;
  }

  case "check": {
    const { check } = await import("./commands/check");
    let checkFlags: ReturnType<typeof parseArgs>;
    try {
      checkFlags = parseArgs({
        args: Bun.argv.slice(3),
        options: {
          staged: { type: "boolean", default: false },
          uncommitted: { type: "boolean", default: false },
          verbose: { type: "boolean", default: false },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (e) {
      handleParseError(e, ["--staged", "--uncommitted", "--verbose"]);
    }
    if (checkFlags.values.staged && checkFlags.values.uncommitted) {
      console.error("Error: --staged and --uncommitted are mutually exclusive.");
      process.exit(1);
    }
    const mode = checkFlags.values.staged
      ? "staged"
      : checkFlags.values.uncommitted
        ? "uncommitted"
        : "committed";
    await check(process.cwd(), mode, { verbose: !!checkFlags.values.verbose });
    break;
  }

  case "list": {
    const { list } = await import("./commands/list");
    const { StubStatusSchema } = await import("./types");
    let listFlags: ReturnType<typeof parseArgs>;
    try {
      listFlags = parseArgs({
        args: Bun.argv.slice(3),
        options: {
          status: { type: "string" },
          all: { type: "boolean", default: false },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (e) {
      handleParseError(e, ["--status", "--all"]);
    }
    const statusVal = listFlags.values.status;
    let validatedStatus: import("./types").StubStatus | undefined;
    if (statusVal !== undefined) {
      const parsed = StubStatusSchema.safeParse(statusVal);
      if (!parsed.success) {
        console.error(`Invalid status: ${statusVal}`);
        console.error("Valid statuses: pending, approved, rejected, needs_fix, resolved");
        process.exit(1);
      }
      validatedStatus = parsed.data;
    }
    if (validatedStatus && listFlags.values.all) {
      console.error("Error: --status and --all are mutually exclusive.");
      process.exit(1);
    }
    await list({
      status: validatedStatus,
      all: !!listFlags.values.all,
    });
    break;
  }

  case "enrich": {
    const { enrich } = await import("./commands/enrich");
    await enrich();
    break;
  }

  case "review": {
    const { review } = await import("./commands/review");
    let reviewFlags: ReturnType<typeof parseArgs>;
    try {
      reviewFlags = parseArgs({
        args: Bun.argv.slice(3),
        options: {
          "approve-safe": { type: "boolean", default: false },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (e) {
      handleParseError(e, ["--approve-safe"]);
    }
    await review(process.cwd(), { approveSafe: !!reviewFlags.values["approve-safe"] });
    break;
  }

  case "approve": {
    const findingId = positionals[1];
    if (!findingId) {
      console.error(APPROVE_USAGE);
      process.exit(1);
    }
    const { approve } = await import("./commands/approve");
    await approve();
    break;
  }

  case "reject": {
    const findingId = positionals[1];
    if (!findingId) {
      console.error(REJECT_USAGE);
      process.exit(1);
    }
    const { reject } = await import("./commands/reject");
    await reject();
    break;
  }

  case "needs-fix": {
    const findingId = positionals[1];
    const hasAllFlag = args.includes("--all");
    if (!findingId && !hasAllFlag) {
      console.error(NEEDS_FIX_USAGE);
      process.exit(1);
    }
    const { needsFix } = await import("./commands/needs-fix");
    await needsFix();
    break;
  }

  case "history": {
    const testFile = positionals[1];
    if (!testFile) {
      console.error(HISTORY_USAGE);
      process.exit(1);
    }
    const { history } = await import("./commands/history");
    await history();
    break;
  }

  case "commit": {
    const { commit } = await import("./commands/commit");
    await commit();
    break;
  }

  case "sync": {
    const { sync } = await import("./commands/sync");
    await sync();
    break;
  }

  case "setup-hooks": {
    const { setupHooks } = await import("./commands/setup-hooks");
    await setupHooks();
    break;
  }

  case "test-llm": {
    const { testLlm } = await import("./commands/test-llm");
    let testLlmFlags: ReturnType<typeof parseArgs>;
    try {
      testLlmFlags = parseArgs({
        args: Bun.argv.slice(3),
        options: {
          prompt: { type: "string" },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (e) {
      handleParseError(e, ["--prompt"]);
    }
    await testLlm(process.cwd(), testLlmFlags.values.prompt as string | undefined);
    break;
  }

  case "audit": {
    const subcommand = positionals[1];
    if (!subcommand) {
      console.error(AUDIT_USAGE);
      process.exit(1);
    }

    if (subcommand === "verify") {
      const { auditVerify, parseFlags } = await import("./commands/audit-verify");
      await auditVerify(parseFlags(Bun.argv.slice(4)));
    } else if (subcommand === "compact") {
      const { auditCompact } = await import("./commands/audit-compact");
      await auditCompact();
    } else {
      console.error(`Unknown audit subcommand: ${subcommand}\n`);
      console.error(AUDIT_USAGE);
      process.exit(1);
    }
    break;
  }

  default:
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    process.exit(1);
}
