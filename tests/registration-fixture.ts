import { expect } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import type { ManifestFileEntry } from "../src/manifest.ts";

export const PRE_REGISTRATION_MANIFEST_VERSION = "1.8.1";

export type ManifestRecord = Record<string, unknown>;

interface ExpectedRegistration {
  entry: string;
  configPath: string;
}

export async function readRecordedManifest(manifestPath: string): Promise<ManifestRecord> {
  return JSON.parse(await readFile(manifestPath, "utf-8")) as ManifestRecord;
}

export async function writePreRegistrationManifest(
  manifestPath: string,
  files: ManifestFileEntry[]
): Promise<void> {
  await writeFile(
    manifestPath,
    JSON.stringify({
      version: PRE_REGISTRATION_MANIFEST_VERSION,
      mode: "plugin",
      entry: null,
      configPath: null,
      files,
    })
  );
}

export async function seedNullRegistration(manifestPath: string): Promise<ManifestRecord> {
  const seeded = await readRecordedManifest(manifestPath);
  const cleared = { ...seeded, entry: null, configPath: null };
  await writeFile(manifestPath, JSON.stringify(cleared, null, 2));
  return cleared;
}

export function expectRegistrationBackfilled(
  manifest: ManifestRecord,
  before: ManifestRecord,
  expected: ExpectedRegistration
): void {
  expect(manifest["entry"]).toBe(expected.entry);
  expect(manifest["configPath"]).toBe(expected.configPath);
  expect(manifest["version"]).toBe(before["version"]);
  expect(manifest["mode"]).toBe(before["mode"]);
  expect(manifest["files"]).toEqual(before["files"]);
  expect(manifest["optionalDependencies"]).toEqual(before["optionalDependencies"]);
}
