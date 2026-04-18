import { exists, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Scope = "local" | "global";

const SKILL_NAME = "test-baselining";
const COMMAND_NAME = "test-baseline.md";

export function getGlobalConfigPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return join(xdgConfig, "opencode");
  }
  return join(homedir(), ".config", "opencode");
}

export function getLocalConfigPath(projectDir: string): string {
  return join(projectDir, ".opencode");
}

function getPackageDir(): string {
  return join(import.meta.dirname, "..");
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await Bun.write(d, Bun.file(s));
    }
  }
}

async function readJsonConfig(path: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeJsonConfig(path: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2));
}

export async function install(scope: Scope, projectDir: string = process.cwd()): Promise<void> {
  const pkgDir = getPackageDir();
  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);
  const skillPath = join(configBase, "skills", SKILL_NAME);
  const commandPath = join(configBase, "commands", COMMAND_NAME);

  const assetsSkillPath = join(pkgDir, "assets", "skills", SKILL_NAME);
  const assetsCommandPath = join(pkgDir, "assets", "commands", COMMAND_NAME);

  if (await exists(assetsSkillPath)) {
    await copyDir(assetsSkillPath, skillPath);
  }

  if (await exists(assetsCommandPath)) {
    await mkdir(join(configBase, "commands"), { recursive: true });
    await Bun.write(commandPath, Bun.file(assetsCommandPath));
  }
}
