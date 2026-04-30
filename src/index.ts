import { init } from "./commands/init";
import { check } from "./commands/check";
import { enrich } from "./commands/enrich";
import { review } from "./commands/review";
import { approve } from "./commands/approve";
import { reject } from "./commands/reject";
import { auditCompact } from "./commands/audit-compact";
import { auditVerify, parseFlags } from "./commands/audit-verify";
import { setupHooks } from "./commands/setup-hooks";

const command = Bun.argv[2];
const subcommand = Bun.argv[3];

switch (command) {
  case "init":
    await init();
    break;
  case "check":
    await check();
    break;
  case "approve":
    await approve();
    break;
  case "reject":
    await reject();
    break;
  case "audit":
    if (subcommand === "compact") {
      await auditCompact();
    } else if (subcommand === "verify") {
      await auditVerify(parseFlags(Bun.argv.slice(4)));
    } else {
      console.log("Usage: test-verifier audit <compact|verify>");
      console.log("  verify [--no-pending] [--no-rejected] [--signatures]");
      process.exit(1);
    }
    break;
  case "review":
    await review();
    break;
  case "enrich":
    await enrich();
    break;
  case "setup-hooks":
    await setupHooks();
    break;
  default:
    console.log("Usage: test-verifier <check|enrich|review|approve|reject|init|audit>");
    process.exit(command ? 1 : 0);
}
