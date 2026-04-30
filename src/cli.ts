#!/usr/bin/env bun

import { parseArgs } from "node:util";

const VERSION = "0.0.1";

const USAGE = `test-verifier v${VERSION}

Usage: test-verifier <command> [options]

Commands:
  init                Initialize test-verifier for this repository
  check               Analyze test changes and generate findings
  enrich              Enrich pending findings with LLM analysis
  review              Interactively review pending findings
  approve <id>        Approve a pending finding
  reject <id>         Reject a pending finding
  audit verify        Verify audit trail integrity
  audit compact       Compact old approved findings into archives
  setup-hooks         Install Husky git hooks (pre-commit, pre-push)

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
    await check();
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

  case "setup-hooks": {
    const { setupHooks } = await import("./commands/setup-hooks");
    await setupHooks();
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
