import { copyFile, exists, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, basename } from "node:path";
import { PluginNameNormalizer } from "./plugin-name.ts";
import { InstallManifest, type InstallMode, type ManifestFileEntry } from "./manifest.ts";
import {
  loadPackageManifest,
  mergeOptionalDependencies,
  PACKAGE_MANIFEST_RELPATH,
  type ExternalSkillSource,
  type PackageOptionalDep,
} from "./optional-deps.ts";
import { PluginConfigEditor } from "./plugin-config.ts";
import { CacheCleaner, type CacheOutcome } from "./cache-cleaner.ts";
import { BundledAssetsMissingError } from "./bundled-assets-missing-error.ts";
import { CopyModeUnsupportedError } from "./copy-mode-unsupported-error.ts";

export type Scope = "local" | "global";
export type { InstallMode } from "./manifest.ts";

export interface InstallOptions {
  addPluginConfig: boolean;
  migrateRootConfig: boolean;
  force: boolean;
}

export type RootConfigConflictHandler = (
  root: Record<string, unknown>,
  dot: Record<string, unknown>
) => Promise<boolean>;

export interface RootMigrationOptions {
  enabled: boolean;
}

export type InstallAction = "installed" | "upgraded" | "noop";

export interface InstallResult {
  action: InstallAction;
  scope: Scope;
  mode: InstallMode;
  skillPaths: string[];
  commandPaths: string[];
  configPath: string | null;
  manifestPath: string;
  entry: string | null;
  skipped: string[];
  migrated: boolean;
  pluginAdded: boolean;
  clearedCache: string[];
  recommendations: string[];
}

export interface UninstallResult {
  scope: Scope;
  removed: string[];
  pluginRemoved: boolean;
}

export interface AureliaRecommendation {
  detected: boolean;
  message: string;
}

const AURELIA_PACKAGE_PATTERNS: Array<(name: string) => boolean> = [
  name => name === "aurelia",
  name => name === "aureliajs",
  name => name.startsWith("@aurelia/"),
  name => name === "aurelia-bootstrapper",
  name => name === "aurelia-framework",
];

const DEP_GROUPS: string[] = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const ASSET_LAYOUT_DIR = ".";

const ASSET_PAYLOAD_DIRS: string[] = ["skills", "commands"];

const pluginConfigEditor = new PluginConfigEditor();
const cacheCleaner = new CacheCleaner();

export function printRecommendations(recommendations: string[]): void {
  for (const recommendation of recommendations) {
    console.log(`\n${recommendation}`);
  }
}

export interface ScopeStatus {
  installed: boolean;
  version: string | null;
  mode: InstallMode | null;
  entry: string | null;
  configPath: string | null;
  pluginInConfig: boolean;
}

export interface StatusResult {
  local: ScopeStatus | null;
  global: ScopeStatus | null;
}

export async function getPackageVersion(): Promise<string> {
  const content = await Bun.file(`${import.meta.dirname}/../package.json`).text();
  return JSON.parse(content).version;
}

export async function getPackageName(): Promise<string> {
  const content = await Bun.file(`${import.meta.dirname}/../package.json`).text();
  return JSON.parse(content).name;
}

export async function getContentDeclaration(): Promise<"assets" | "code"> {
  const content = await Bun.file(`${import.meta.dirname}/../package.json`).text();
  return JSON.parse(content).content === "code" ? "code" : "assets";
}

export async function resolveMode(requested: InstallMode | null): Promise<InstallMode> {
  const declaration = await getContentDeclaration();
  if (declaration === "code") {
    if (requested === "copy") {
      throw new CopyModeUnsupportedError(await getPackageName());
    }
    return "plugin";
  }
  return requested ?? "copy";
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

function getPackagesCacheRoot(): string {
  return cacheCleaner.packagesCacheRoot();
}

async function isAssetDirEmpty(assetDir: string): Promise<boolean> {
  try {
    return (await readdir(assetDir)).length === 0;
  } catch {
    return true;
  }
}

export async function resolvePackageDir(
  packageName: string,
  packageVersion: string,
  cacheRoot: string,
  packageDir: string = getPackageDir()
): Promise<string> {
  for (const payloadDir of ASSET_PAYLOAD_DIRS) {
    const assetDir = join(packageDir, ASSET_LAYOUT_DIR, payloadDir);
    if (await isAssetDirEmpty(assetDir)) {
      throw new BundledAssetsMissingError(assetDir, packageName, packageVersion, cacheRoot);
    }
  }
  return packageDir;
}

function isFileNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

interface PlannedAssetFile {
  sourcePath: string;
  relativeDest: string;
}

async function collectAssetFiles(packageDir: string): Promise<PlannedAssetFile[]> {
  const planned: PlannedAssetFile[] = [];
  planned.push(...(await collectSkillFiles(join(packageDir, ASSET_LAYOUT_DIR, "skills"))));
  planned.push(...(await collectCommandFiles(join(packageDir, ASSET_LAYOUT_DIR, "commands"))));
  planned.push(...(await collectAgentFiles(join(packageDir, ASSET_LAYOUT_DIR, "agents"))));
  return planned;
}

function contentSourceDirs(packageDir: string): string[] {
  return [...ASSET_PAYLOAD_DIRS, "agents"].map(contentDir => join(packageDir, ASSET_LAYOUT_DIR, contentDir));
}

async function collectSkillFiles(assetsRoot: string): Promise<PlannedAssetFile[]> {
  return collectGroupedFiles(assetsRoot, "skills");
}

async function collectAgentFiles(assetsRoot: string): Promise<PlannedAssetFile[]> {
  return collectGroupedFiles(assetsRoot, "agents");
}

async function collectGroupedFiles(assetsRoot: string, destFolder: string): Promise<PlannedAssetFile[]> {
  const planned: PlannedAssetFile[] = [];
  if (!(await exists(assetsRoot))) {
    return planned;
  }
  for (const entry of await readdir(assetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const groupSource = join(assetsRoot, entry.name);
    const groupDest = join(destFolder, entry.name);
    planned.push(...(await collectNestedFiles(groupSource, groupDest)));
  }
  return planned;
}

async function collectCommandFiles(assetsRoot: string): Promise<PlannedAssetFile[]> {
  const planned: PlannedAssetFile[] = [];
  if (!(await exists(assetsRoot))) {
    return planned;
  }
  for (const entry of await readdir(assetsRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".md")) {
      planned.push({
        sourcePath: join(assetsRoot, entry.name),
        relativeDest: join("commands", entry.name),
      });
    }
  }
  return planned;
}

async function collectNestedFiles(directory: string, relativeBase: string): Promise<PlannedAssetFile[]> {
  const planned: PlannedAssetFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nestedSource = join(directory, entry.name);
    const nestedDest = join(relativeBase, entry.name);
    if (entry.isDirectory()) {
      planned.push(...(await collectNestedFiles(nestedSource, nestedDest)));
    } else {
      planned.push({ sourcePath: nestedSource, relativeDest: nestedDest });
    }
  }
  return planned;
}

async function removeStaleVersionMarkers(skillsBase: string): Promise<void> {
  if (!(await exists(skillsBase))) {
    return;
  }
  for (const entry of await readdir(skillsBase, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const markerPath = join(skillsBase, entry.name, ".version");
    if (await exists(markerPath)) {
      await rm(markerPath);
    }
  }
}

function toManifestPath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/");
}

function requiredRecordedHash(manifest: InstallManifest, relativePath: string): string {
  const recorded = manifest.recordedHash(relativePath);
  if (recorded === null) {
    throw new Error(`Manifest disposition required a recorded hash for: ${relativePath}`);
  }
  return recorded;
}

function writtenSkillDirs(configBase: string, writtenRelativePaths: string[]): string[] {
  const dirs = new Set<string>();
  for (const relativePath of writtenRelativePaths) {
    const manifestPath = toManifestPath(relativePath);
    if (!manifestPath.startsWith("skills/")) {
      continue;
    }
    const skillName = manifestPath.slice("skills/".length).split("/")[0];
    dirs.add(join(configBase, "skills", skillName));
  }
  return [...dirs];
}

function writtenCommandFiles(configBase: string, writtenRelativePaths: string[]): string[] {
  return writtenRelativePaths
    .map(toManifestPath)
    .filter(manifestPath => manifestPath.startsWith("commands/"))
    .map(manifestPath => join(configBase, manifestPath));
}

function stripJsoncSyntax(source: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") {
        i++;
      }
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        i++;
      }
      i++;
      continue;
    }
    if (char === ",") {
      const next = skipJsoncTrivia(source, i + 1);
      if (source[next] === "}" || source[next] === "]") {
        continue;
      }
    }
    out += char;
  }
  return out;
}

function skipJsoncTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") {
        index++;
      }
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index++;
      }
      index += 2;
      continue;
    }
    break;
  }
  return index;
}

function parseConfigContent(content: string, path: string): Record<string, unknown> | null {
  const tolerated = path.endsWith(".jsonc") ? stripJsoncSyntax(content) : content;
  try {
    return JSON.parse(tolerated);
  } catch {
    return null;
  }
}

async function readJsonConfig(path: string): Promise<Record<string, unknown> | null> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return {};
    }
    return null;
  }
  return parseConfigContent(content, path);
}

async function writeJsonConfig(path: string, config: Record<string, unknown>): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2));
}

async function readPluginEntries(configPath: string): Promise<string[] | null> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return [];
    }
    return null;
  }
  const config = parseConfigContent(content, configPath);
  if (config === null) {
    console.warn(
      `Warning: config file ${configPath} could not be parsed; ignoring it for registration ` +
        `detection. The file was left unchanged.`
    );
    return null;
  }
  const plugins = config["plugin"];
  if (!Array.isArray(plugins)) {
    return [];
  }
  return plugins.filter((entry): entry is string => typeof entry === "string");
}

export async function isPluginInConfigBase(
  configBase: string,
  packageName: string
): Promise<boolean> {
  let registered = false;
  for (const candidate of candidateConfigPaths(configBase)) {
    const entries = await readPluginEntries(candidate);
    if (entries === null) {
      continue;
    }
    if (entries.some(entry => PluginNameNormalizer.matches(entry, packageName))) {
      registered = true;
    }
  }
  return registered;
}

function candidateConfigPaths(configBase: string): string[] {
  const paths: string[] = [
    join(configBase, "opencode.json"),
    join(configBase, "opencode.jsonc"),
  ];
  if (basename(configBase) === ".opencode") {
    const repoRoot = dirname(configBase);
    paths.push(join(repoRoot, "opencode.json"), join(repoRoot, "opencode.jsonc"));
  }
  return paths;
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
  options: RootMigrationOptions,
  onConflict: RootConfigConflictHandler | null = null
): Promise<boolean> {
  if (!options.enabled) {
    return false;
  }

  const { needed, rootConfigPath, dotOpenencodeConfigPath, rootConfig, dotOpenencodeConfig } =
    await checkMigrationNeeded(projectDir);

  if (!needed) {
    return false;
  }

  if (rootConfig === null) {
    console.warn(
      `Refusing to migrate ${rootConfigPath}: the file is not valid JSON. ` +
        `Fix or remove the file, then re-run install. The file was left unchanged.`
    );
    return false;
  }

  const dotExists = await exists(dotOpenencodeConfigPath);
  if (dotExists && dotOpenencodeConfig === null) {
    console.warn(
      `Refusing to migrate ${rootConfigPath}: ${dotOpenencodeConfigPath} is not valid JSON. ` +
        `Both files were left unchanged.`
    );
    return false;
  }

  if (dotExists && dotOpenencodeConfig !== null) {
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
    await writeFile(dotOpenencodeConfigPath, await readFile(rootConfigPath, "utf-8"));
  }

  await rm(rootConfigPath);
  return true;
}

export async function install(
  scope: Scope,
  projectDir: string = process.cwd(),
  options: InstallOptions,
  requestedMode: InstallMode | null = null,
  pruneCache: boolean = true,
  packageDir: string = getPackageDir()
): Promise<InstallResult> {
  const packageName = await getPackageName();
  const packageVersion = await getPackageVersion();
  const cacheRoot = getPackagesCacheRoot();

  const cache = pruneCache
    ? await pruneOwnCache(packageName, packageVersion)
    : noCacheOutcome();

  const mode = await resolveMode(requestedMode);
  const pkgDir = await resolvePackageDir(packageName, packageVersion, cacheRoot, packageDir);

  const { addPluginConfig, migrateRootConfig: allowRootMigration, force } = options;

  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);
  const manifestPath = join(configBase, `${packageName}.manifest.json`);

  let migrated = false;

  if (scope === "local" && allowRootMigration) {
    migrated = await migrateRootConfig(projectDir, { enabled: true });
  }

  const manifest = await InstallManifest.read(manifestPath);
  const sameVersion = manifest.matchesVersion(packageVersion);
  const plannedFiles = await collectAssetFiles(pkgDir);

  if (plannedFiles.length === 0) {
    throw new BundledAssetsMissingError(
      contentSourceDirs(pkgDir).join(", "),
      packageName,
      packageVersion,
      cacheRoot
    );
  }

  const writtenRelativePaths: string[] = [];
  const skipped: string[] = [];
  const recordedFiles: ManifestFileEntry[] = [];

  for (const plannedFile of plannedFiles) {
    const manifestEntryPath = toManifestPath(plannedFile.relativeDest);
    const verdict = await manifest.disposition(configBase, plannedFile.relativeDest, sameVersion, force);

    if (verdict === "skip") {
      skipped.push(manifestEntryPath);
      recordedFiles.push({ path: manifestEntryPath, hash: requiredRecordedHash(manifest, plannedFile.relativeDest) });
      continue;
    }

    const installedPath = join(configBase, plannedFile.relativeDest);

    if (verdict === "keep") {
      recordedFiles.push({ path: manifestEntryPath, hash: requiredRecordedHash(manifest, plannedFile.relativeDest) });
      continue;
    }

    await mkdir(dirname(installedPath), { recursive: true });
    await copyFile(plannedFile.sourcePath, installedPath);
    const installedHash = await InstallManifest.hashFile(installedPath);
    if (installedHash === null) {
      throw new Error(`Failed to hash installed file: ${installedPath}`);
    }
    recordedFiles.push({ path: manifestEntryPath, hash: installedHash });
    writtenRelativePaths.push(plannedFile.relativeDest);
  }

  const action: InstallAction =
    writtenRelativePaths.length === 0 ? "noop" : manifest.hasContents() ? "upgraded" : "installed";

  let entry = manifest.entry;
  let configPath = manifest.configPath;
  let pluginAdded = false;

  if (addPluginConfig) {
    const outcome = await pluginConfigEditor.ensurePluginEntry(packageName, { scope, projectDir });
    if (outcome.warning !== null) {
      console.warn(`[${packageName}] ${outcome.warning}`);
    }
    if (outcome.action !== "blocked") {
      entry = PluginNameNormalizer.canonicalize(packageName);
      configPath = outcome.configPath;
      pluginAdded = outcome.action === "updated" || outcome.action === "created";
    }
  }

  const pkgManifest = await loadPackageManifest(pkgDir);
  let declaredDeps: PackageOptionalDep[] = [];
  if (!pkgManifest.ok) {
    console.warn(
      `[${packageName}] Ignoring invalid ${PACKAGE_MANIFEST_RELPATH}: ${pkgManifest.errors.join("; ")}`
    );
  } else {
    declaredDeps = pkgManifest.manifest.optionalDependencies;
  }
  const depMerge = mergeOptionalDependencies(manifest.optionalDependencies, declaredDeps);

  const registrationRecorded =
    manifest.mode === mode && manifest.entry === entry && manifest.configPath === configPath;
  const shouldWriteManifest =
    recordedFiles.length > 0 &&
    (writtenRelativePaths.length > 0 ||
      depMerge.changed ||
      pluginAdded ||
      !manifest.hasContents() ||
      !registrationRecorded);

  if (shouldWriteManifest) {
    if (writtenRelativePaths.length > 0) {
      await removeStaleVersionMarkers(join(configBase, "skills"));
    }
    const filesToRecord = action === "noop" ? manifest.files : recordedFiles;
    await InstallManifest.write(
      manifestPath,
      packageVersion,
      filesToRecord,
      depMerge.dependencies,
      mode,
      entry,
      configPath
    );
  }

  const aureliaCheck = await detectAurelia(projectDir);
  const optionalSkillRecs = await detectOptionalSkills(configBase, pkgDir);
  const recommendations: string[] = [];
  if (aureliaCheck.detected) {
    recommendations.push(aureliaCheck.message);
  }
  recommendations.push(...optionalSkillRecs);

  return {
    action,
    scope,
    mode,
    skillPaths: writtenSkillDirs(configBase, writtenRelativePaths),
    commandPaths: writtenCommandFiles(configBase, writtenRelativePaths),
    configPath,
    manifestPath,
    entry,
    skipped,
    migrated,
    pluginAdded,
    clearedCache: cache.removed,
    recommendations,
  };
}

function noCacheOutcome(): CacheOutcome {
  return { removed: [], warnings: [] };
}

async function pruneOwnCache(packageName: string, packageVersion: string): Promise<CacheOutcome> {
  const outcome = await cacheCleaner.prunePackageCache(packageName, packageVersion);
  for (const warning of outcome.warnings) {
    console.warn(`[${packageName}] Warning: ${warning}`);
  }
  return outcome;
}

export async function uninstall(
  scope: Scope,
  projectDir: string = process.cwd()
): Promise<UninstallResult> {
  const packageName = await getPackageName();

  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);

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

  const manifestPath = join(configBase, `${packageName}.manifest.json`);
  if (await exists(manifestPath)) {
    await rm(manifestPath);
    removed.push(manifestPath);
  }

  const outcome = await pluginConfigEditor.removePluginEntry(packageName, { scope, projectDir });
  if (outcome.warning !== null) {
    console.warn(`[${packageName}] ${outcome.warning}`);
  }
  const pluginRemoved = outcome.action === "removed";

  return { scope, removed, pluginRemoved };
}

export async function status(projectDir: string = process.cwd()): Promise<StatusResult> {
  const packageName = await getPackageName();
  return {
    local: await readScopeStatus(getLocalConfigPath(projectDir), packageName),
    global: await readScopeStatus(getGlobalConfigPath(), packageName),
  };
}

export async function isScopeInstalled(configBase: string, packageName: string): Promise<boolean> {
  return (await readScopeStatus(configBase, packageName)) !== null;
}

async function readScopeStatus(configBase: string, packageName: string): Promise<ScopeStatus | null> {
  const manifest = await InstallManifest.read(join(configBase, `${packageName}.manifest.json`));
  if (!manifest.hasContents()) {
    return null;
  }
  if (!(await manifest.payloadMatches(configBase))) {
    return null;
  }
  if (manifest.mode === "plugin" && manifest.entry !== null && manifest.configPath !== null) {
    if (!(await isRecordedEntryPresent(manifest.configPath, packageName))) {
      return null;
    }
  }
  const pluginInConfig = await isPluginInConfigBase(configBase, packageName);
  return {
    installed: true,
    version: manifest.version,
    mode: manifest.mode,
    entry: manifest.entry,
    configPath: manifest.configPath,
    pluginInConfig,
  };
}

async function isRecordedEntryPresent(configPath: string, packageName: string): Promise<boolean> {
  const entries = await readPluginEntries(configPath);
  if (entries === null) {
    return false;
  }
  return entries.some(entry => PluginNameNormalizer.matches(entry, packageName));
}

export async function detectAurelia(projectDir: string): Promise<AureliaRecommendation> {
  const pkgJsonPath = join(projectDir, "package.json");
  if (!(await exists(pkgJsonPath))) {
    return { detected: false, message: "" };
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
  } catch {
    return { detected: false, message: "" };
  }

  const matched = new Set<string>();
  for (const groupKey of DEP_GROUPS) {
    const group = pkg[groupKey];
    if (group && typeof group === "object") {
      for (const name of Object.keys(group as Record<string, unknown>)) {
        if (AURELIA_PACKAGE_PATTERNS.some(matches => matches(name))) {
          matched.add(name);
        }
      }
    }
  }

  if (matched.size === 0) {
    return { detected: false, message: "" };
  }

  const evidence = [...matched].sort().join(", ");
  const message = [
    "Aurelia detected in this project (package.json: " + evidence + ").",
    "The opencode-auto-qcgates skills are VCS-agnostic and backend/frontend-language agnostic, but",
    "for richer AI-assisted Aurelia work, install the aurelia-expert skill pack (it is not a",
    "dependency — these paths are surfaced by the installer only, never auto-applied):",
    "  - OpenCode (recommended): add \"aurelia-expert\" to your opencode.json `plugin` array, e.g.",
    `      { "$schema": "https://opencode.ai/config.json", "plugin": ["aurelia-expert"] }`,
    "  - Cross-agent / non-OpenCode: `npx skills add expert-vision-software/aurelia-expert`",
  ].join("\n");

  return { detected: true, message };
}

function isExternalSkill(
  dep: PackageOptionalDep
): dep is PackageOptionalDep & { source: ExternalSkillSource } {
  return dep.source.type === "external-skill";
}

function externalSkillRecommendation(
  dep: PackageOptionalDep & { source: ExternalSkillSource }
): string {
  const { repo, skill } = dep.source;
  return [
    `Optional skill not detected: \`${dep.id}\``,
    `  Purpose: ${dep.description}`,
    `  Source:  github.com/${repo}. Not shipped by this plugin.`,
    "  One-shot (no permanent install — init captures the generated prompt):",
    `    CI=true npx -y skills use ${repo} --skill ${skill}`,
    "  Permanent install (default agent `universal` if your agent is unknown):",
    `    npx -y skills add ${repo} --skill ${skill} -a universal`,
    `  After a permanent install, \`loadSkill({ name: "${skill}" })\` resolves directly from the agent's skills path.`,
  ].join("\n");
}

export async function detectOptionalSkills(
  configBase: string,
  packageDir: string = getPackageDir()
): Promise<string[]> {
  const recs: string[] = [];

  const pkgManifest = await loadPackageManifest(packageDir);
  if (!pkgManifest.ok) {
    return recs;
  }

  for (const dep of pkgManifest.manifest.optionalDependencies) {
    if (dep.kind !== "skill" || !isExternalSkill(dep)) {
      continue;
    }
    const skillPath = join(configBase, "skills", dep.id);
    if (await exists(skillPath)) {
      continue;
    }
    recs.push(externalSkillRecommendation(dep));
  }

  return recs;
}

export async function readLocalConfig(projectDir: string): Promise<Record<string, unknown> | null> {
  const localConfigPath = join(getLocalConfigPath(projectDir), "opencode.json");
  const config = await readJsonConfig(localConfigPath);
  if (config === null) {
    return null;
  }
  if (Object.keys(config).length === 0) {
    return null;
  }
  return config;
}

export function mergeConfigWithOverrides(
  input: Record<string, unknown>,
  localConfig: Record<string, unknown>
): void {
  for (const [key, value] of Object.entries(localConfig)) {
    if (key === "plugin" || key === "agent") {
      continue;
    }
    input[key] = value;
  }
}
