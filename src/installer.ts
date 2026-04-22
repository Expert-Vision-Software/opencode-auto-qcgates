import { exists, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Scope = "local" | "global";

export interface InstallOptions {
  addPluginConfig?: boolean;
}

export interface InstallResult {
  scope: Scope;
  skillPaths: string[];
  commandPaths: string[];
  configPath: string;
  migrated: boolean;
  pluginAdded: boolean;
}

export interface UninstallResult {
  scope: Scope;
  removed: string[];
  pluginRemoved: boolean;
}

export interface StatusResult {
  local: { installed: boolean; version: string | null; pluginInConfig: boolean } | null;
  global: { installed: boolean; version: string | null; pluginInConfig: boolean } | null;
}

export async function getPackageVersion(): Promise<string> {
  const content = await Bun.file(`${import.meta.dirname}/../package.json`).text();
  return JSON.parse(content).version;
}

export async function getPackageName(): Promise<string> {
  const content = await Bun.file(`${import.meta.dirname}/../package.json`).text();
  return JSON.parse(content).name;
}

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

async function addPluginToConfig(configPath: string, pluginName: string): Promise<boolean> {
  const config = await readJsonConfig(configPath);

  if (!config.plugin) {
    config.plugin = [];
  }

  const plugins = config.plugin as string[];
  if (plugins.includes(pluginName)) {
    return false;
  }

  plugins.push(pluginName);
  config.plugin = plugins;

  await mkdir(join(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  return true;
}

async function removePluginFromConfig(configPath: string, pluginName: string): Promise<boolean> {
  const config = await readJsonConfig(configPath);

  if (!config.plugin) {
    return false;
  }

  const plugins = config.plugin as string[];
  const index = plugins.indexOf(pluginName);

  if (index === -1) {
    return false;
  }

  plugins.splice(index, 1);

  if (plugins.length === 0) {
    delete config.plugin;
  } else {
    config.plugin = plugins;
  }

  await mkdir(join(configPath, ".."), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
  return true;
}

async function isPluginInConfig(configPath: string, pluginName: string): Promise<boolean> {
  const config = await readJsonConfig(configPath);

  if (!config.plugin) {
    return false;
  }

  const plugins = config.plugin as string[];
  return plugins.includes(pluginName);
}

export async function checkMigrationNeeded(projectDir: string): Promise<{
  needed: boolean;
  rootConfigPath: string;
  dotOpenencodeConfigPath: string;
  rootConfig: Record<string, unknown> | null;
  dotOpenencodeConfig: Record<string, unknown> | null;
}> {
  const rootConfigPath = join(projectDir, "opencode.json");
  const dotOpenencodeConfigPath = join(projectDir, ".opencode", "opencode.json");

  const rootExists = await exists(rootConfigPath);
  const dotOpenencodeExists = await exists(dotOpenencodeConfigPath);

  if (!rootExists) {
    return {
      needed: false,
      rootConfigPath,
      dotOpenencodeConfigPath,
      rootConfig: null,
      dotOpenencodeConfig: null,
    };
  }

  const rootConfig = await readJsonConfig(rootConfigPath);
  const dotOpenencodeConfig = dotOpenencodeExists ? await readJsonConfig(dotOpenencodeConfigPath) : null;

  return {
    needed: rootExists,
    rootConfigPath,
    dotOpenencodeConfigPath,
    rootConfig,
    dotOpenencodeConfig,
  };
}

export async function migrateRootConfig(
  projectDir: string,
  onConflict?: (root: Record<string, unknown>, dot: Record<string, unknown>) => Promise<boolean>
): Promise<boolean> {
  const { needed, rootConfigPath, dotOpenencodeConfigPath, rootConfig, dotOpenencodeConfig } =
    await checkMigrationNeeded(projectDir);

  if (!needed || !rootConfig) {
    return false;
  }

  if (dotOpenencodeConfig) {
    const hasConflict = Object.keys(rootConfig).some(key => key in dotOpenencodeConfig);
    if (hasConflict && onConflict) {
      const shouldContinue = await onConflict(rootConfig, dotOpenencodeConfig);
      if (!shouldContinue) {
        return false;
      }
    }

    const merged = { ...rootConfig, ...dotOpenencodeConfig };
    await writeJsonConfig(dotOpenencodeConfigPath, merged);
  } else {
    await mkdir(join(projectDir, ".opencode"), { recursive: true });
    await writeJsonConfig(dotOpenencodeConfigPath, rootConfig);
  }

  await rm(rootConfigPath);
  return true;
}

export async function install(
  scope: Scope,
  projectDir: string = process.cwd(),
  options: InstallOptions = {}
): Promise<InstallResult> {
  const packageName = await getPackageName();
  const pkgDir = getPackageDir();

  const { addPluginConfig = true } = options;

  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);
  const configPath = join(configBase, "opencode.json");

  let migrated = false;

  if (scope === "local") {
    migrated = await migrateRootConfig(projectDir);
  }

  const skillPaths: string[] = [];
  const commandPaths: string[] = [];

  const assetsSkillsPath = join(pkgDir, "assets", "skills");
  const assetsCommandsPath = join(pkgDir, "assets", "commands");
  const assetsAgentsPath = join(pkgDir, "assets", "agents");

  if (await exists(assetsSkillsPath)) {
    await mkdir(join(configBase, "skills"), { recursive: true });
    for (const entry of await readdir(assetsSkillsPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const destPath = join(configBase, "skills", entry.name);
        await copyDir(join(assetsSkillsPath, entry.name), destPath);
        skillPaths.push(destPath);
      }
    }
  }

  if (await exists(assetsCommandsPath)) {
    await mkdir(join(configBase, "commands"), { recursive: true });
    for (const entry of await readdir(assetsCommandsPath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const destPath = join(configBase, "commands", entry.name);
        await Bun.write(destPath, Bun.file(join(assetsCommandsPath, entry.name)));
        commandPaths.push(destPath);
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

  let pluginAdded = false;
  if (addPluginConfig) {
    pluginAdded = await addPluginToConfig(configPath, packageName);
  }

  return {
    scope,
    skillPaths,
    commandPaths,
    configPath,
    migrated,
    pluginAdded,
  };
}

export async function uninstall(
  scope: Scope,
  projectDir: string = process.cwd()
): Promise<UninstallResult> {
  const packageName = await getPackageName();

  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);
  const configPath = join(configBase, "opencode.json");

  const removed: string[] = [];

  const skillsPath = join(configBase, "skills");
  const commandsPath = join(configBase, "commands");
  const agentsPath = join(configBase, "agents");

  if (await exists(skillsPath)) {
    for (const entry of await readdir(skillsPath, { withFileTypes: true })) {
      const entryPath = join(skillsPath, entry.name);
      if (entry.isDirectory()) {
        await rm(entryPath, { recursive: true });
        removed.push(entryPath);
      }
    }
  }

  if (await exists(commandsPath)) {
    for (const entry of await readdir(commandsPath, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const entryPath = join(commandsPath, entry.name);
        await rm(entryPath);
        removed.push(entryPath);
      }
    }
  }

  if (await exists(agentsPath)) {
    for (const entry of await readdir(agentsPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await rm(join(agentsPath, entry.name), { recursive: true });
      }
    }
  }

  let pluginRemoved = false;
  if (await exists(configPath)) {
    pluginRemoved = await removePluginFromConfig(configPath, packageName);
  }

  return { scope, removed, pluginRemoved };
}

export async function status(projectDir: string = process.cwd()): Promise<StatusResult> {
  const packageName = await getPackageName();

  const localConfigPath = getLocalConfigPath(projectDir);
  const localConfigFile = join(localConfigPath, "opencode.json");

  const globalConfigPath = getGlobalConfigPath();
  const globalConfigFile = join(globalConfigPath, "opencode.json");

  let localStatus: { installed: boolean; version: string | null; pluginInConfig: boolean } | null = null;
  let globalStatus: { installed: boolean; version: string | null; pluginInConfig: boolean } | null = null;

  try {
    const localSkillsPath = join(localConfigPath, "skills");
    if (await exists(localSkillsPath)) {
      const entries = await readdir(localSkillsPath, { withFileTypes: true });
      const hasSkills = entries.some(e => e.isDirectory());
      if (hasSkills) {
        const localPluginInConfig = await isPluginInConfig(localConfigFile, packageName);
        localStatus = { installed: true, version: null, pluginInConfig: localPluginInConfig };
      }
    }
  } catch {
    // Not installed
  }

  try {
    const globalSkillsPath = join(globalConfigPath, "skills");
    if (await exists(globalSkillsPath)) {
      const entries = await readdir(globalSkillsPath, { withFileTypes: true });
      const hasSkills = entries.some(e => e.isDirectory());
      if (hasSkills) {
        const globalPluginInConfig = await isPluginInConfig(globalConfigFile, packageName);
        globalStatus = { installed: true, version: null, pluginInConfig: globalPluginInConfig };
      }
    }
  } catch {
    // Not installed
  }

  return {
    local: localStatus,
    global: globalStatus,
  };
}