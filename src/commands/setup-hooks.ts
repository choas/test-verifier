import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

const HOOKS = ["pre-commit", "pre-push"] as const;

function findTemplateDir(): string {
  return join(dirname(import.meta.dir), "hooks");
}

export async function setupHooks(cwd: string = process.cwd()): Promise<void> {
  const huskyDir = join(cwd, ".husky");

  if (!existsSync(huskyDir)) {
    console.log("Initializing Husky...");
    mkdirSync(huskyDir, { recursive: true });
    execFileSync("git", ["config", "core.hooksPath", ".husky"], { cwd });
  }

  const templateDir = findTemplateDir();

  for (const hook of HOOKS) {
    const src = join(templateDir, hook);
    const dest = join(huskyDir, hook);

    if (!existsSync(src)) {
      console.error(`Template not found: ${src}`);
      process.exit(1);
    }

    const content = readFileSync(src, "utf-8");
    writeFileSync(dest, content);
    chmodSync(dest, 0o755);

    console.log(`Installed ${hook} → .husky/${hook}`);
  }

  console.log("\nHusky hooks installed. Hooks will run automatically on commit and push.");
}
