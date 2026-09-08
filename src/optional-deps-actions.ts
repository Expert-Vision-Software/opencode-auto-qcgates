import { copyFile, exists, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { PluginNameNormalizer } from "./plugin-name.ts";
import { InstallManifest, type ManifestFileEntry } from "./manifest.ts";
import { canonicalJson } from "./optional-deps.ts";
import {
  isInteractiveStdio,
  printDepRunResult,
  selectPendingOptionalDeps,
} from "./prompts.ts";
import type { BundledSource, ExternalSkillSource, InstallOptionalDep, NpmSource, PackageOptionalDep } from "./optional-deps.ts";
import type { Scope } from "./installer.ts";

export type ExecutorOptions = { cwd?: string };

export type CommandExecutor = (command: string, args: string[], options?: ExecutorOptions) => Promise<number>;

export interface OptionalDepsContext {
  scope: Scope;
  configBase: string;
  configPath: string;
  manifestPath: string;
  packageDir: string;
}

export interface DepApplyResult {
  ok: boolean;
  message: string;
  files: ManifestFileEntry[];
}

export function okResult(message: string, files: ManifestFileEntry[] = []): DepApplyResult {
  return { ok: true, message, files };
}

export function failResult(message: string): DepApplyResult {
  return { ok: false, message, files: [] };
}

export async function defaultCommandExecutor(
  command: string,
  args: string[],
  options?: ExecutorOptions
): Promise<number> {
  const { spawn } = await import("node:child_process");
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: options?.cwd,
    });
    child.on("error", reject);
    child.on("close", code => resolve(code ?? 1));
  });
}

function isFileNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readJsonConfig(configPath: string): Promise<Record<string, unknown> | null> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {};
    }
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeJsonConfig(configPath: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

async function copyTree(source: string, dest: string): Promise<string[]> {
  const copied: string[] = [];
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const entrySource = join(source, entry.name);
    const entryDest = join(dest, entry.name);
    if (entry.isDirectory()) {
      copied.push(...(await copyTree(entrySource, entryDest)));
    } else {
      await mkdir(dirname(entryDest), { recursive: true });
      await copyFile(entrySource, entryDest);
      copied.push(entryDest);
    }
  }
  return copied;
}

function toManifestPath(absolutePath: string, configBase: string): string {
  return relative(configBase, absolutePath).replaceAll("\\", "/");
}

function externalSkillWorkingDir(ctx: OptionalDepsContext): string {
  return ctx.scope === "global" ? homedir() : dirname(ctx.configBase);
}

async function installBundledAsset(
  dep: PackageOptionalDep,
  source: BundledSource,
  ctx: OptionalDepsContext
): Promise<DepApplyResult> {
  const group = dep.kind === "skill" ? "skills" : dep.kind === "agent" ? "agents" : null;
  if (group === null) {
    return failResult(`bundled sources only support the "skill" and "agent" kinds, not "${dep.kind}"`);
  }
  const sourceRoot = join(ctx.packageDir, source.path);
  if (!(await exists(sourceRoot))) {
    return failResult(`bundled source not found in package: ${source.path}`);
  }
  const destRoot = join(ctx.configBase, group, dep.id);
  const copied = await copyTree(sourceRoot, destRoot);
  const files: ManifestFileEntry[] = [];
  for (const file of copied) {
    const hash = await InstallManifest.hashFile(file);
    if (hash === null) {
      return failResult(`failed to hash copied file: ${file}`);
    }
    files.push({ path: toManifestPath(file, ctx.configBase), hash });
  }
  const singular = group === "skills" ? "skill" : "agent";
  return okResult(`Installed bundled ${singular} \`${dep.id}\` (${files.length} file${files.length === 1 ? "" : "s"})`, files);
}

async function installExternalSkill(
  dep: PackageOptionalDep,
  source: ExternalSkillSource,
  ctx: OptionalDepsContext,
  exec: CommandExecutor
): Promise<DepApplyResult> {
  const code = await exec(
    "npx",
    ["-y", "skills", "add", source.repo, "--skill", source.skill, "-a", "universal"],
    { cwd: externalSkillWorkingDir(ctx) }
  );
  if (code !== 0) {
    return failResult(`skill installer exited with code ${code}`);
  }
  return okResult(`Installed external skill \`${source.skill}\` from github.com/${source.repo}`);
}

async function addPluginEntry(source: NpmSource, ctx: OptionalDepsContext): Promise<DepApplyResult> {
  const config = await readJsonConfig(ctx.configPath);
  if (config === null) {
    return failResult(`refusing to edit ${ctx.configPath}: the file is not valid JSON`);
  }
  const existing = Array.isArray(config["plugin"]) ? (config["plugin"] as unknown[]).map(String) : [];
  if (existing.some(entry => PluginNameNormalizer.matches(entry, source.package))) {
    return okResult(`Plugin \`${source.package}\` already present in config`);
  }
  const ref = PluginNameNormalizer.canonicalize(source.package);
  config["plugin"] = [...existing, ref];
  await writeJsonConfig(ctx.configPath, config);
  return okResult(`Added plugin \`${ref}\` to config`);
}

async function addMcpEntry(dep: PackageOptionalDep, ctx: OptionalDepsContext): Promise<DepApplyResult> {
  let entry: Record<string, unknown>;
  if (dep.source.type === "command") {
    entry = { type: "local", command: dep.source.command.trim().split(/\s+/), enabled: true };
  } else if (dep.source.type === "url") {
    entry = { type: "remote", url: dep.source.url, enabled: true };
  } else {
    return failResult(`mcp dependencies require a "command" or "url" source, not "${dep.source.type}"`);
  }

  const config = await readJsonConfig(ctx.configPath);
  if (config === null) {
    return failResult(`refusing to edit ${ctx.configPath}: the file is not valid JSON`);
  }
  const mcp = typeof config["mcp"] === "object" && config["mcp"] !== null && !Array.isArray(config["mcp"])
    ? (config["mcp"] as Record<string, unknown>)
    : {};
  const existing = mcp[dep.id];
  if (existing !== undefined) {
    if (canonicalJson(existing) === canonicalJson(entry)) {
      return okResult(`MCP server \`${dep.id}\` already configured`);
    }
    return failResult(`MCP server \`${dep.id}\` is already configured with different settings; refusing to overwrite`);
  }
  mcp[dep.id] = entry;
  config["mcp"] = mcp;
  await writeJsonConfig(ctx.configPath, config);
  return okResult(`Added MCP server \`${dep.id}\` to config`);
}

export async function applyOptionalDep(
  dep: PackageOptionalDep,
  ctx: OptionalDepsContext,
  exec: CommandExecutor = defaultCommandExecutor
): Promise<DepApplyResult> {
  const source = dep.source;
  if (source.type === "bundled") {
    return installBundledAsset(dep, source, ctx);
  }
  if (source.type === "external-skill") {
    return installExternalSkill(dep, source, ctx, exec);
  }
  if (dep.kind === "plugin" && source.type === "npm") {
    return addPluginEntry(source, ctx);
  }
  if (dep.kind === "mcp") {
    return addMcpEntry(dep, ctx);
  }
  return failResult(`no installer action for kind "${dep.kind}" with source type "${source.type}"`);
}

export interface DepRunResult {
  applied: Array<{ id: string; message: string }>;
  declined: string[];
  failed: Array<{ id: string; reason: string }>;
  changed: boolean;
}

function sameDeps(a: InstallOptionalDep[], b: InstallOptionalDep[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, index) =>
        entry.id === b[index].id &&
        entry.kind === b[index].kind &&
        entry.description === b[index].description &&
        entry.state === b[index].state &&
        canonicalJson(entry.source) === canonicalJson(b[index].source)
    )
  );
}

export async function applyOptionalDepDecisions(
  ctx: OptionalDepsContext,
  deps: InstallOptionalDep[],
  acceptedIds: Iterable<string>,
  exec: CommandExecutor = defaultCommandExecutor
): Promise<DepRunResult> {
  const acceptedSet = new Set(acceptedIds);
  const nextDeps = deps.map(dep => ({ ...dep }));
  const extraFiles: ManifestFileEntry[] = [];
  const applied: Array<{ id: string; message: string }> = [];
  const declined: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const [index, dep] of nextDeps.entries()) {
    if (acceptedSet.has(dep.id)) {
      const result = await applyOptionalDep(dep, ctx, exec);
      if (result.ok) {
        nextDeps[index] = { ...dep, state: "accepted" };
        extraFiles.push(...result.files);
        applied.push({ id: dep.id, message: result.message });
      } else {
        failed.push({ id: dep.id, reason: result.message });
      }
      continue;
    }
    if (dep.state === "accepted") {
      continue;
    }
    if (dep.state !== "declined") {
      nextDeps[index] = { ...dep, state: "declined" };
      declined.push(dep.id);
    }
  }

  const manifest = await InstallManifest.read(ctx.manifestPath);
  if (!manifest.hasContents() || manifest.version === null) {
    throw new Error(`Install manifest not found at ${ctx.manifestPath}; run install first.`);
  }

  let files = manifest.files;
  if (extraFiles.length > 0) {
    const byPath = new Map(files.map(entry => [entry.path, entry]));
    for (const entry of extraFiles) {
      byPath.set(entry.path, entry);
    }
    files = [...byPath.values()];
  }

  const changed = !sameDeps(nextDeps, deps) || extraFiles.length > 0;
  if (changed) {
    await InstallManifest.write(ctx.manifestPath, manifest.version, files, nextDeps);
  }

  return { applied, declined, failed, changed };
}

export interface ConsentOptions {
  interactive?: boolean;
  select?: (pending: InstallOptionalDep[]) => Promise<string[]>;
  exec?: CommandExecutor;
}

export async function runOptionalDepsConsent(
  ctx: OptionalDepsContext,
  deps: InstallOptionalDep[],
  options: ConsentOptions = {}
): Promise<DepRunResult | null> {
  const pending = deps.filter(dep => dep.state === "pending");
  if (pending.length === 0) {
    return null;
  }
  const interactive = options.interactive ?? isInteractiveStdio();
  if (!interactive) {
    console.log(
      `\nOptional dependencies pending consent: ${pending.map(dep => dep.id).join(", ")}` +
        `\n  Non-interactive session — nothing was auto-installed; they remain pending.` +
        `\n  Re-run the installer interactively or choose "Manage optional dependencies" to review them.`
    );
    return null;
  }
  const select = options.select ?? selectPendingOptionalDeps;
  const acceptedIds = await select(pending);
  const result = await applyOptionalDepDecisions(ctx, deps, acceptedIds, options.exec);
  printDepRunResult(result);
  return result;
}
