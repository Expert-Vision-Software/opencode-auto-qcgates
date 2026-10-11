import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PluginNameNormalizer } from "./plugin-name.ts";

export type ConfigPluginEntry = string | { package?: unknown };

const FILE_URL_SCHEME = "file://";
const PACKAGE_PROPERTY = "package";
const PACKAGE_JSON_FILE = "package.json";
const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:[\\/]/;

export class PluginEntryResolver {
  private readonly resolutionCache: Map<string, Promise<string | null>> = new Map();

  isPathForm(entry: ConfigPluginEntry): boolean {
    const target = this.entryTarget(entry);
    if (target === null) {
      return false;
    }
    return this.looksLikePath(target);
  }

  async matchesAny(
    entries: ConfigPluginEntry[],
    packageName: string,
    baseDir: string | null
  ): Promise<boolean> {
    for (const entry of entries) {
      if (await this.matches(entry, packageName, baseDir)) {
        return true;
      }
    }
    return false;
  }

  async matches(entry: ConfigPluginEntry, packageName: string, baseDir: string | null): Promise<boolean> {
    try {
      const target = this.entryTarget(entry);
      if (target === null) {
        return false;
      }
      if (!this.looksLikePath(target)) {
        return this.matchesName(target, packageName);
      }
      const resolved = await this.resolvePackageName(entry, baseDir);
      if (resolved === null) {
        return false;
      }
      return this.matchesName(resolved, packageName);
    } catch {
      return false;
    }
  }

  async resolvePackageName(entry: ConfigPluginEntry, baseDir: string | null): Promise<string | null> {
    const target = this.entryTarget(entry);
    if (target === null || !this.looksLikePath(target)) {
      return null;
    }
    const cacheKey = JSON.stringify([baseDir, target]);
    const cached = this.resolutionCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const resolution = this.resolveThroughFilesystem(target, baseDir);
    this.resolutionCache.set(cacheKey, resolution);
    return resolution;
  }

  private entryTarget(entry: ConfigPluginEntry): string | null {
    if (typeof entry === "string") {
      return entry;
    }
    const target = entry[PACKAGE_PROPERTY];
    return typeof target === "string" ? target : null;
  }

  private matchesName(entry: string, packageName: string): boolean {
    return PluginNameNormalizer.matches(entry, PluginNameNormalizer.normalize(packageName));
  }

  private looksLikePath(target: string): boolean {
    const trimmed = target.trim();
    if (trimmed.length === 0) {
      return false;
    }
    return (
      trimmed.toLowerCase().startsWith(FILE_URL_SCHEME) ||
      trimmed.startsWith("/") ||
      trimmed.startsWith("./") ||
      trimmed.startsWith("../") ||
      trimmed.startsWith("~/") ||
      trimmed === "." ||
      trimmed === ".." ||
      WINDOWS_DRIVE_PATTERN.test(trimmed)
    );
  }

  private async resolveThroughFilesystem(target: string, baseDir: string | null): Promise<string | null> {
    try {
      const start = await this.entryStartPath(target, baseDir);
      if (start === null) {
        return null;
      }
      const real = await realpath(start);
      const info = await stat(real);
      const directory = info.isDirectory() ? real : dirname(real);
      return await this.findPackageName(directory);
    } catch {
      return null;
    }
  }

  private async entryStartPath(target: string, baseDir: string | null): Promise<string | null> {
    const trimmed = target.trim();
    if (trimmed.toLowerCase().startsWith(FILE_URL_SCHEME)) {
      return fileURLToPath(trimmed);
    }
    if (trimmed.startsWith("~/")) {
      return join(homedir(), trimmed.slice(2));
    }
    if (isAbsolute(trimmed)) {
      return trimmed;
    }
    if (baseDir === null) {
      return null;
    }
    return resolve(baseDir, trimmed);
  }

  private async findPackageName(directory: string): Promise<string | null> {
    let current = directory;
    for (;;) {
      const name = await this.readPackageName(join(current, PACKAGE_JSON_FILE));
      if (name !== null) {
        return name;
      }
      const parent = dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  private async readPackageName(packageJsonPath: string): Promise<string | null> {
    try {
      const parsed = JSON.parse(await readFile(packageJsonPath, "utf-8")) as Record<string, unknown>;
      const name = parsed["name"];
      if (typeof name === "string" && name.trim().length > 0) {
        return name;
      }
      return null;
    } catch {
      return null;
    }
  }
}
