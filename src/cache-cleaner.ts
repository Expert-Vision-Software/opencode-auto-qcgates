import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CacheOutcome {
  removed: string[];
  warnings: string[];
}

export class CacheCleaner {
  packagesCacheRoot(): string {
    const xdgCacheHome = process.env.XDG_CACHE_HOME;
    if (xdgCacheHome) {
      return join(xdgCacheHome, "opencode", "packages");
    }
    return join(homedir(), ".cache", "opencode", "packages");
  }

  async prunePackageCache(packageName: string, packageVersion: string): Promise<CacheOutcome> {
    const wanted: string[] = [
      packageName,
      `${packageName}@latest`,
      `${packageName}@${packageVersion}`,
    ];
    return this.removeMatching(name => wanted.includes(name));
  }

  async clearPackageCache(packageName: string): Promise<CacheOutcome> {
    const prefix = `${packageName}@`;
    return this.removeMatching(name => name === packageName || name.startsWith(prefix));
  }

  private async removeMatching(wanted: (name: string) => boolean): Promise<CacheOutcome> {
    const removed: string[] = [];
    const warnings: string[] = [];
    const cacheRoot = this.packagesCacheRoot();

    let entries: string[];
    try {
      entries = await readdir(cacheRoot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { removed, warnings };
      }
      throw error;
    }

    const targets = entries
      .filter(wanted)
      .sort()
      .map(name => join(cacheRoot, name));

    for (const target of targets) {
      try {
        await rm(target, { recursive: true, force: true });
        removed.push(target);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Could not clear cached package ${target}: ${message}`);
      }
    }

    return { removed, warnings };
  }
}
