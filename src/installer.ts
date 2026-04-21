import { exists, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Scope = "local" | "global";

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

  const assetsSkillsPath = join(pkgDir, "assets", "skills");
  const assetsCommandsPath = join(pkgDir, "assets", "commands");
  const assetsAgentsPath = join(pkgDir, "assets", "agents");

  if (await exists(assetsSkillsPath)) {
    for (const entry of await readdir(assetsSkillsPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await copyDir(join(assetsSkillsPath, entry.name), join(configBase, "skills", entry.name));
      }
    }
  }

  if (await exists(assetsCommandsPath)) {
    await mkdir(join(configBase, "commands"), { recursive: true });
    for (const entry of await readdir(assetsCommandsPath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        await Bun.write(join(configBase, "commands", entry.name), Bun.file(join(assetsCommandsPath, entry.name)));
      }
    }
  }

  if (await exists(assetsAgentsPath)) {
    await mkdir(join(configBase, "agents"), { recursive: true });
    for (const entry of await readdir(assetsAgentsPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await copyDir(join(assetsAgentsPath, entry.name), join(configBase, "agents", entry.name));
      }
    }
  }
}
