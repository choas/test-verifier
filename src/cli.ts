#!/usr/bin/env bun

import { parseArgs } from "node:util";

const VERSION = "0.0.1";

const USAGE = `test-verifier v${VERSION}

Usage: test-verifier <command> [options]

Commands:
  init                Initialize test-verifier for this repository
  check [--staged|--uncommitted]
                      Analyze test changes and generate findings
                        --staged       Check staged (index) changes vs HEAD
                        --uncommitted  Check all uncommitted changes vs HEAD
  enrich              Enrich pending findings with LLM analysis
  review              Interactively review pending findings
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
    const checkFlags = parseArgs({
      args: Bun.argv.slice(3),
      options: {
        staged: { type: "boolean", default: false },
        uncommitted: { type: "boolean", default: false },
      },
      allowPositionals: true,
      strict: false,
    });
    const mode = checkFlags.values.staged
      ? "staged"
      : checkFlags.values.uncommitted
        ? "uncommitted"
        : "committed";
    await check(process.cwd(), mode);
    break;
  }

  case "enrich": {
    const { enrich } = await import("./commands/enrich");
    await enrich();
    break;
  }

  case "review": {
    const { review } = await import("./commands/review");
    await review();
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
    const testLlmFlags = parseArgs({
      args: Bun.argv.slice(3),
      options: {
        prompt: { type: "string" },
      },
      allowPositionals: true,
      strict: false,
    });
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
