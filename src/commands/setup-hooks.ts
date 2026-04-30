import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { $ } from "bun";

const HOOKS = ["pre-commit", "pre-push"] as const;

function findTemplateDir(): string {
  return join(dirname(import.meta.dir), "hooks");
}

export async function setupHooks(cwd: string = process.cwd()): Promise<void> {
  const huskyDir = join(cwd, ".husky");

  if (!existsSync(huskyDir)) {
    console.log("Initializing Husky...");
    await $`npx husky init`.cwd(cwd).quiet();
  }

  const templateDir = findTemplateDir();

  for (const hook of HOOKS) {
    const src = join(templateDir, hook);
    const dest = join(huskyDir, hook);

    if (!existsSync(src)) {
      console.error(`Template not found: ${src}`);
      process.exit(1);
    }

    const content = await Bun.file(src).text();
    await Bun.write(dest, content);
    await $`chmod +x ${dest}`.quiet();

    console.log(`Installed ${hook} → .husky/${hook}`);
  }

  console.log("\nHusky hooks installed. Hooks will run automatically on commit and push.");
}
