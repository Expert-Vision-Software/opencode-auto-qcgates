import { describe, test, expect } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_ROOT = join(import.meta.dirname, "..");
const ONLY_ALLOWED_ROOT_CODE_FILE = "index.ts";
const CODE_FILE_EXTENSIONS = [".ts", ".js"];

describe("package layout", () => {
  test("index.ts is the only code file at the package root", async () => {
    const rootEntries = await readdir(PACKAGE_ROOT, { withFileTypes: true });
    const rootCodeFiles = rootEntries
      .filter(rootEntry => rootEntry.isFile() && hasCodeFileExtension(rootEntry.name))
      .map(rootEntry => rootEntry.name)
      .sort();

    expect(rootCodeFiles).toEqual([ONLY_ALLOWED_ROOT_CODE_FILE]);
  });
});

function hasCodeFileExtension(fileName: string): boolean {
  return CODE_FILE_EXTENSIONS.some(extension => fileName.endsWith(extension));
}
