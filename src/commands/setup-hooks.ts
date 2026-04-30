import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOOK_CONTENTS: Record<string, string> = {
  "pre-commit": `#!/usr/bin/env sh
bunx test-verifier check
`,
  "pre-push": `#!/usr/bin/env sh
bunx test-verifier enrich && bunx test-verifier audit verify --no-pending --no-rejected
`,
};

export async function setupHooks(cwd: string = process.cwd()): Promise<void> {
  const huskyDir = join(cwd, ".husky");

  if (!existsSync(huskyDir)) {
    console.log("Initializing git hooks...");
    mkdirSync(huskyDir, { recursive: true });
    execFileSync("git", ["config", "core.hooksPath", ".husky"], { cwd });
  }

  for (const [hook, content] of Object.entries(HOOK_CONTENTS)) {
    const dest = join(huskyDir, hook);

    writeFileSync(dest, content);
    chmodSync(dest, 0o755);

    console.log(`Installed ${hook} → .husky/${hook}`);
  }

  console.log("\nGit hooks installed. Hooks will run automatically on commit and push.");
}
