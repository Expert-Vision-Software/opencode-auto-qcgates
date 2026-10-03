import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isValidOptionalDepEntry, type InstallOptionalDep } from "./optional-deps.ts";

export type InstallMode = "copy" | "plugin";

export interface ManifestFileEntry {
  path: string;
  hash: string;
}

export interface ManifestContents {
  version: string;
  mode: InstallMode;
  entry: string | null;
  configPath: string | null;
  files: ManifestFileEntry[];
  optionalDependencies: InstallOptionalDep[] | null;
}

export type ManifestFileDisposition = "write" | "keep" | "skip";

export class InstallManifest {
  private readonly contents: ManifestContents | null;

  private constructor(contents: ManifestContents | null) {
    this.contents = contents;
  }

  static async read(manifestPath: string): Promise<InstallManifest> {
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf-8"));
      return new InstallManifest(InstallManifest.normalize(parsed));
    } catch {
      return new InstallManifest(null);
    }
  }

  static async write(
    manifestPath: string,
    version: string,
    files: ManifestFileEntry[],
    optionalDependencies: InstallOptionalDep[] | null,
    mode: InstallMode,
    entry: string | null,
    configPath: string | null
  ): Promise<void> {
    const contents: ManifestContents = {
      version,
      mode,
      entry,
      configPath,
      files,
      optionalDependencies,
    };
    await writeFile(manifestPath, JSON.stringify(contents, null, 2) + "\n");
  }

  static async hashFile(filePath: string): Promise<string | null> {
    try {
      return createHash("sha256").update(await readFile(filePath)).digest("hex");
    } catch {
      return null;
    }
  }

  get version(): string | null {
    return this.contents?.version ?? null;
  }

  get mode(): InstallMode | null {
    return this.contents?.mode ?? null;
  }

  get entry(): string | null {
    return this.contents?.entry ?? null;
  }

  get configPath(): string | null {
    return this.contents?.configPath ?? null;
  }

  get files(): ManifestFileEntry[] {
    return this.contents?.files ?? [];
  }

  get optionalDependencies(): InstallOptionalDep[] {
    return this.contents?.optionalDependencies ?? [];
  }

  hasContents(): boolean {
    return this.contents !== null;
  }

  matchesVersion(version: string): boolean {
    return this.contents !== null && this.contents.version === version;
  }

  recordedHash(relativePath: string): string | null {
    if (this.contents === null) {
      return null;
    }
    const manifestPath = InstallManifest.toManifestPath(relativePath);
    return this.contents.files.find(entry => entry.path === manifestPath)?.hash ?? null;
  }

  async payloadMatches(configBase: string): Promise<boolean> {
    if (this.contents === null || this.contents.files.length === 0) {
      return false;
    }
    for (const entry of this.contents.files) {
      const installedHash = await InstallManifest.hashFile(join(configBase, entry.path));
      if (installedHash !== entry.hash) {
        return false;
      }
    }
    return true;
  }

  async disposition(
    configBase: string,
    relativePath: string,
    sameVersion: boolean,
    force: boolean
  ): Promise<ManifestFileDisposition> {
    const priorHash = this.recordedHash(relativePath);
    if (priorHash === null) {
      return "write";
    }
    const installedHash = await InstallManifest.hashFile(join(configBase, relativePath));
    if (installedHash === null) {
      return "write";
    }
    if (installedHash === priorHash) {
      return sameVersion ? "keep" : "write";
    }
    return force ? "write" : "skip";
  }

  private static toManifestPath(relativePath: string): string {
    return relativePath.replaceAll("\\", "/");
  }

  private static normalize(value: unknown): ManifestContents | null {
    if (typeof value !== "object" || value === null) {
      return null;
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate["version"] !== "string") {
      return null;
    }
    if (
      !Array.isArray(candidate["files"]) ||
      !candidate["files"].every(entry => InstallManifest.isHashEntry(entry))
    ) {
      return null;
    }
    let optionalDependencies: InstallOptionalDep[] | null = null;
    if (
      Array.isArray(candidate["optionalDependencies"]) &&
      candidate["optionalDependencies"].every(entry => InstallManifest.isOptionalDepEntry(entry))
    ) {
      optionalDependencies = candidate["optionalDependencies"] as InstallOptionalDep[];
    }
    return {
      version: candidate["version"],
      mode: candidate["mode"] === "plugin" ? "plugin" : "copy",
      entry: typeof candidate["entry"] === "string" ? candidate["entry"] : null,
      configPath: typeof candidate["configPath"] === "string" ? candidate["configPath"] : null,
      files: candidate["files"] as ManifestFileEntry[],
      optionalDependencies,
    };
  }

  private static isHashEntry(value: unknown): value is ManifestFileEntry {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return typeof candidate["path"] === "string" && typeof candidate["hash"] === "string";
  }

  private static isOptionalDepEntry(value: unknown): value is InstallOptionalDep {
    if (!isValidOptionalDepEntry(value)) {
      return false;
    }
    const state = (value as unknown as Record<string, unknown>)["state"];
    return state === "pending" || state === "accepted" || state === "declined";
  }
}
