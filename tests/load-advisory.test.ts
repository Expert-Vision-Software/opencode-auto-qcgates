import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, writeFile } from "node:fs/promises";
import { findPendingOptionalDeps } from "../src/load-advisory.ts";
import { SANDBOX_GLOBAL_BASE, resetGlobalConfig, withGlobalSandbox } from "./global-sandbox.ts";

const TEST_DIR = join(import.meta.dirname, ".test-temp");
const PACKAGE_NAME = "opencode-auto-qcgates";

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true }).catch(() => {});
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true });
});

async function makeFixture(name: string): Promise<string> {
  const fixtureDir = join(TEST_DIR, name);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  return fixtureDir;
}

async function writeInstallManifest(
  configBase: string,
  optionalDependencies: Array<{ id: string; state: string }>
): Promise<void> {
  await mkdir(configBase, { recursive: true });
  await writeFile(
    join(configBase, `${PACKAGE_NAME}.manifest.json`),
    JSON.stringify({ version: "0.0.0-test", files: [], optionalDependencies }, null, 2)
  );
}

function dep(id: string, state: string) {
  return {
    id,
    kind: "skill",
    description: `${id} description`,
    source: { type: "external-skill", repo: "mattpocock/skills", skill: id },
    state,
  };
}

describe("findPendingOptionalDeps", () => {
  test("no install manifests anywhere: zero pending", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-none");

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(0);
      expect(result.ids).toEqual([]);
    });
  });

  test("local manifest with a pending declared dep: counted", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-local");
      await writeInstallManifest(join(fixtureDir, ".opencode"), [dep("grilling", "pending")]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(1);
      expect(result.ids).toEqual(["grilling"]);
    });
  });

  test("global manifest with a pending declared dep: counted", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-global");
      await writeInstallManifest(SANDBOX_GLOBAL_BASE, [dep("grilling", "pending")]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(1);
      expect(result.ids).toEqual(["grilling"]);
    });
  });

  test("the same dep pending in both scopes: counted once", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-both-scopes");
      await writeInstallManifest(SANDBOX_GLOBAL_BASE, [dep("grilling", "pending")]);
      await writeInstallManifest(join(fixtureDir, ".opencode"), [dep("grilling", "pending")]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(1);
      expect(result.ids).toEqual(["grilling"]);
    });
  });

  test("accepted and declined entries are not pending", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-resolved");
      await writeInstallManifest(join(fixtureDir, ".opencode"), [
        dep("grilling", "accepted"),
        dep("grilling", "declined"),
      ]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(0);
      expect(result.ids).toEqual([]);
    });
  });

  test("a pending id no longer declared by the package manifest is not counted", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-orphan");
      await writeInstallManifest(join(fixtureDir, ".opencode"), [
        dep("removed-long-ago", "pending"),
        dep("grilling", "accepted"),
      ]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(0);
      expect(result.ids).toEqual([]);
    });
  });

  test("an install manifest without an optional section: zero pending", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-legacy-manifest");
      const configBase = join(fixtureDir, ".opencode");
      await mkdir(configBase, { recursive: true });
      await writeFile(
        join(configBase, `${PACKAGE_NAME}.manifest.json`),
        JSON.stringify({ version: "0.0.0-test", files: [] }, null, 2)
      );

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(0);
      expect(result.ids).toEqual([]);
    });
  });

  test("only performs reads: the inspected directories are byte-for-byte unchanged", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("pending-read-only");
      await writeInstallManifest(join(fixtureDir, ".opencode"), [dep("grilling", "pending")]);

      const result = await findPendingOptionalDeps(fixtureDir);

      expect(result.count).toBe(1);
      expect(await exists(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "opencode.json"))).toBe(false);
      expect(await exists(join(fixtureDir, "opencode.json"))).toBe(false);
    });
  });
});
