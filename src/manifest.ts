import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isValidOptionalDepEntry, type InstallOptionalDep } from "./optional-deps.ts";

export interface ManifestFileEntry {
  path: string;
  hash: string;
}

export interface ManifestContents {
  version: string;
  files: ManifestFileEntry[];
  optionalDependencies?: InstallOptionalDep[];
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
      if (!InstallManifest.isWellFormed(parsed)) {
        return new InstallManifest(null);
      }
      return new InstallManifest(parsed);
    } catch {
      return new InstallManifest(null);
    }
  }

  static async write(
    manifestPath: string,
    version: string,
    files: ManifestFileEntry[],
    optionalDependencies?: InstallOptionalDep[]
  ): Promise<void> {
    const contents: ManifestContents = { version, files };
    if (optionalDependencies !== undefined) {
      contents.optionalDependencies = optionalDependencies;
    }
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

  private static isWellFormed(value: unknown): value is ManifestContents {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    if (typeof candidate["version"] !== "string") {
      return false;
    }
    if (!Array.isArray(candidate["files"])) {
      return false;
    }
    if (!candidate["files"].every(entry => InstallManifest.isHashEntry(entry))) {
      return false;
    }
    if (candidate["optionalDependencies"] !== undefined) {
      if (!Array.isArray(candidate["optionalDependencies"])) {
        return false;
      }
      if (!candidate["optionalDependencies"].every(entry => InstallManifest.isOptionalDepEntry(entry))) {
        return false;
      }
    }
    return true;
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
