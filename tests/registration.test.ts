import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { RegistrationDetector, type RegistrationContext } from "../src/registration.ts";
import { snapshotDirectory } from "./snapshot.ts";

const TEST_DIR = join(import.meta.dirname, ".test-registration");
const PACKAGE_NAME = "opencode-auto-qcgates";

let sandboxXdg = "";

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  sandboxXdg = join(TEST_DIR, "xdg");
  process.env.XDG_CONFIG_HOME = sandboxXdg;
});

afterAll(async () => {
  if (process.env.XDG_CONFIG_HOME === sandboxXdg) {
    delete process.env.XDG_CONFIG_HOME;
  }
  await rm(TEST_DIR, { recursive: true, force: true });
});

async function makeFixture(name: string): Promise<string> {
  const fixtureDir = join(TEST_DIR, name);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  return fixtureDir;
}

async function resetGlobalConfig(): Promise<void> {
  await rm(join(sandboxXdg, "opencode"), { recursive: true, force: true });
}

async function writeGlobalConfig(plugin: string[]): Promise<void> {
  const globalDir = join(sandboxXdg, "opencode");
  await mkdir(globalDir, { recursive: true });
  await writeFile(
    join(globalDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin }, null, 2)
  );
}

async function writeNestedRepoConfig(fixtureDir: string, plugin: string[]): Promise<void> {
  const localDir = join(fixtureDir, ".opencode");
  await mkdir(localDir, { recursive: true });
  await writeFile(
    join(localDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin }, null, 2)
  );
}

async function writeRootRepoConfig(fixtureDir: string, plugin: string[]): Promise<void> {
  await writeFile(
    join(fixtureDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin }, null, 2)
  );
}

async function expectContext(fixtureDir: string, expected: RegistrationContext): Promise<void> {
  expect(await RegistrationDetector.detect(fixtureDir)).toBe(expected);
}

describe("RegistrationDetector.detect", () => {
  test("returns none when nothing registers the package anywhere", async () => {
    const fixtureDir = await makeFixture("none");
    await resetGlobalConfig();
    await expectContext(fixtureDir, "none");
  });

  test("returns global for a bare-name global registration", async () => {
    const fixtureDir = await makeFixture("global-bare");
    await resetGlobalConfig();
    await writeGlobalConfig([PACKAGE_NAME]);
    await expectContext(fixtureDir, "global");
  });

  test("returns global for a name@latest global registration", async () => {
    const fixtureDir = await makeFixture("global-latest");
    await resetGlobalConfig();
    await writeGlobalConfig([`${PACKAGE_NAME}@latest`]);
    await expectContext(fixtureDir, "global");
  });

  test("returns global for a pinned name@x.y.z global registration", async () => {
    const fixtureDir = await makeFixture("global-pinned");
    await resetGlobalConfig();
    await writeGlobalConfig([`${PACKAGE_NAME}@1.4.0`]);
    await expectContext(fixtureDir, "global");
  });

  test("returns repo-local for a nested .opencode/opencode.json registration", async () => {
    const fixtureDir = await makeFixture("repo-nested");
    await resetGlobalConfig();
    await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
    await expectContext(fixtureDir, "repo-local");
  });

  test("returns repo-local for a repo-root opencode.json registration", async () => {
    const fixtureDir = await makeFixture("repo-root");
    await resetGlobalConfig();
    await writeRootRepoConfig(fixtureDir, [`${PACKAGE_NAME}@latest`]);
    await expectContext(fixtureDir, "repo-local");
  });

  test("returns repo-local when a foreign plugin occupies the global registration", async () => {
    const fixtureDir = await makeFixture("repo-with-foreign-global");
    await resetGlobalConfig();
    await writeGlobalConfig(["opencode-architect"]);
    await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
    await expectContext(fixtureDir, "repo-local");
  });

  test("returns both when both scopes register the package", async () => {
    const fixtureDir = await makeFixture("both");
    await resetGlobalConfig();
    await writeGlobalConfig([PACKAGE_NAME]);
    await writeRootRepoConfig(fixtureDir, [PACKAGE_NAME]);
    await expectContext(fixtureDir, "both");
  });

  test("detection performs zero disk writes", async () => {
    const fixtureDir = await makeFixture("zero-write");
    await resetGlobalConfig();
    await writeGlobalConfig([PACKAGE_NAME]);
    await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
    const before = await snapshotDirectory(fixtureDir);
    const beforeGlobal = await snapshotDirectory(join(sandboxXdg, "opencode"));

    await RegistrationDetector.detect(fixtureDir);

    expect(await snapshotDirectory(fixtureDir)).toEqual(before);
    expect(await snapshotDirectory(join(sandboxXdg, "opencode"))).toEqual(beforeGlobal);
  });
});

describe("RegistrationDetector.scopesToEnsure", () => {
  test("maps each context to its managed scopes", () => {
    expect(RegistrationDetector.scopesToEnsure("none")).toEqual([]);
    expect(RegistrationDetector.scopesToEnsure("global")).toEqual(["global"]);
    expect(RegistrationDetector.scopesToEnsure("repo-local")).toEqual(["local"]);
    expect(RegistrationDetector.scopesToEnsure("both")).toEqual(["global", "local"]);
  });
});

describe("RegistrationDetector.hasAnyInstallation", () => {
  test("returns false when nothing is installed in any scope", async () => {
    const fixtureDir = await makeFixture("install-none");
    await resetGlobalConfig();
    expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(false);
  });

  test("returns true when the global scope holds an install", async () => {
    const fixtureDir = await makeFixture("install-global");
    await resetGlobalConfig();
    const globalDir = join(sandboxXdg, "opencode");
    await mkdir(join(globalDir, "skills", "test-baselining"), { recursive: true });
    await writeFile(join(globalDir, "skills", "test-baselining", "SKILL.md"), "---\nname: test-baselining\n---\n");
    expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(true);
  });

  test("returns true when only the repo scope holds an install", async () => {
    const fixtureDir = await makeFixture("install-repo");
    await resetGlobalConfig();
    const legacySkillDir = join(fixtureDir, ".opencode", "skills", "test-baselining");
    await mkdir(legacySkillDir, { recursive: true });
    await writeFile(join(legacySkillDir, ".version"), "1.1.0");
    expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(true);
  });
});
