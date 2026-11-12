import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { join } from "node:path";
import { cp, exists, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { install, detectOptionalSkills } from "../src/installer.ts";
import type { InstallOptionalDep } from "../src/optional-deps.ts";
import { installOptions } from "./install-options-fixture.ts";

const TEST_DIR = join(import.meta.dirname, ".test-decline-optional");
const REPO_ROOT = join(import.meta.dirname, "..");
const PACKAGE_NAME = "opencode-auto-qcgates";
const SANDBOX = join(TEST_DIR, "sandbox");

process.env.XDG_CACHE_HOME = join(TEST_DIR, ".cache");

const BASE_OPTIONS = installOptions();

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  await mkdir(SANDBOX, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

async function makeFixture(name: string): Promise<string> {
  const fixtureDir = join(TEST_DIR, name);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  return fixtureDir;
}

function manifestPath(fixtureDir: string): string {
  return join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`);
}

async function readManifest(fixtureDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(manifestPath(fixtureDir), "utf-8")) as Record<string, unknown>;
}

async function readDeps(fixtureDir: string): Promise<InstallOptionalDep[]> {
  return (await readManifest(fixtureDir))["optionalDependencies"] as InstallOptionalDep[];
}

async function rewriteDeps(
  fixtureDir: string,
  mutate: (deps: InstallOptionalDep[]) => InstallOptionalDep[]
): Promise<void> {
  const manifest = await readManifest(fixtureDir);
  manifest["optionalDependencies"] = mutate(manifest["optionalDependencies"] as InstallOptionalDep[]);
  await writeFile(manifestPath(fixtureDir), JSON.stringify(manifest, null, 2));
}

describe("install declineOptional", () => {
  test("records declined for the named dependency and preserves every other field", async () => {
    const fixtureDir = await makeFixture("declines-named");
    const first = await install("local", fixtureDir, BASE_OPTIONS);
    const before = await readManifest(fixtureDir);

    const second = await install("local", fixtureDir, {
      ...BASE_OPTIONS,
      declineOptional: ["grilling"],
    });

    expect(second.action).toBe("noop");
    expect(second.manifestPath).toBe(first.manifestPath);
    const after = await readManifest(fixtureDir);
    expect(after["version"]).toBe(before["version"]);
    expect(after["mode"]).toBe(before["mode"]);
    expect(after["entry"]).toBe(before["entry"]);
    expect(after["configPath"]).toBe(before["configPath"]);
    expect(after["files"]).toEqual(before["files"]);

    const deps = after["optionalDependencies"] as InstallOptionalDep[];
    expect(deps[0].id).toBe("grilling");
    expect(deps[0].state).toBe("declined");
    expect(deps[0].kind).toBe("skill");
    expect(deps[0].source).toEqual({
      type: "external-skill",
      repo: "mattpocock/skills",
      skill: "grilling",
    });
  });

  test("preserves the recorded state of other dependencies", async () => {
    const fixtureDir = await makeFixture("preserves-others");
    await install("local", fixtureDir, BASE_OPTIONS);
    await rewriteDeps(fixtureDir, deps => [
      ...deps,
      {
        id: "retired-dep",
        kind: "skill",
        description: "No longer declared by the package.",
        source: { type: "bundled", path: "skills/retired-dep" },
        state: "accepted",
      },
    ]);

    await install("local", fixtureDir, {
      ...BASE_OPTIONS,
      declineOptional: ["grilling"],
    });

    const deps = await readDeps(fixtureDir);
    expect(deps.map(dep => [dep.id, dep.state])).toEqual([
      ["grilling", "declined"],
      ["retired-dep", "accepted"],
    ]);
  });

  test("a repeated decline is idempotent", async () => {
    const fixtureDir = await makeFixture("repeated-decline");
    await install("local", fixtureDir, BASE_OPTIONS);
    const decline = { ...BASE_OPTIONS, declineOptional: ["grilling"] };
    await install("local", fixtureDir, decline);
    const firstBytes = await readFile(manifestPath(fixtureDir), "utf-8");

    const second = await install("local", fixtureDir, decline);

    expect(second.action).toBe("noop");
    expect(await readFile(manifestPath(fixtureDir), "utf-8")).toBe(firstBytes);
  });

  test("an unknown id throws a clear error and leaves a fresh directory untouched", async () => {
    const fixtureDir = await makeFixture("unknown-fresh");

    await expect(
      install("local", fixtureDir, { ...BASE_OPTIONS, declineOptional: ["not-a-real-dep"] })
    ).rejects.toThrow(/not-a-real-dep/);
    expect(await exists(join(fixtureDir, ".opencode"))).toBe(false);
  });

  test("an unknown id leaves an existing install byte-for-byte unchanged", async () => {
    const fixtureDir = await makeFixture("unknown-existing");
    await install("local", fixtureDir, BASE_OPTIONS);
    const manifestBytes = await readFile(manifestPath(fixtureDir), "utf-8");
    const skillFile = join(fixtureDir, ".opencode", "skills", "test-baselining", "SKILL.md");
    const skillBytes = await readFile(skillFile, "utf-8");

    await expect(
      install("local", fixtureDir, { ...BASE_OPTIONS, declineOptional: ["nope"] })
    ).rejects.toThrow(/nope/);

    expect(await readFile(manifestPath(fixtureDir), "utf-8")).toBe(manifestBytes);
    expect(await readFile(skillFile, "utf-8")).toBe(skillBytes);
  });

  test("the error lists the ids that are available to decline", async () => {
    const fixtureDir = await makeFixture("error-lists-known");
    await install("local", fixtureDir, BASE_OPTIONS);

    await expect(
      install("local", fixtureDir, { ...BASE_OPTIONS, declineOptional: ["nope"] })
    ).rejects.toThrow(/grilling/);
  });

  test("an invalid package manifest warns and ignores --decline-optional instead of failing", async () => {
    const fixtureDir = await makeFixture("invalid-package-manifest");
    const packageDir = join(TEST_DIR, "invalid-package");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    await cp(join(REPO_ROOT, "skills"), join(packageDir, "skills"), { recursive: true });
    await cp(join(REPO_ROOT, "commands"), join(packageDir, "commands"), { recursive: true });
    await writeFile(join(packageDir, "manifest.json"), "{ this is not json");

    const warnings: string[] = [];
    const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    let result: Awaited<ReturnType<typeof install>>;
    try {
      result = await install(
        "local",
        fixtureDir,
        { ...BASE_OPTIONS, declineOptional: ["grilling"] },
        null,
        false,
        packageDir
      );
    } finally {
      warn.mockRestore();
    }

    expect(result.action).toBe("installed");
    expect(warnings.join("\n")).toContain("--decline-optional");
    expect(warnings.join("\n")).toContain("invalid");
    expect(await readDeps(fixtureDir)).toEqual([]);
  });

  test("detectOptionalSkills omits a declined dependency from recommendations", async () => {
    const declinedDir = await makeFixture("recommendation-declined");
    await install("local", declinedDir, {
      ...BASE_OPTIONS,
      declineOptional: ["grilling"],
    });

    const configBase = join(declinedDir, ".opencode");
    expect(await detectOptionalSkills(configBase, REPO_ROOT, [])).toEqual([]);
  });

  test("detectOptionalSkills still recommends a pending dependency", async () => {
    const pendingDir = await makeFixture("recommendation-pending");
    await install("local", pendingDir, BASE_OPTIONS);

    const configBase = join(pendingDir, ".opencode");
    const recommendations = await detectOptionalSkills(configBase, REPO_ROOT, []);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toContain("grilling");
  });
});

interface CliRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(cwd: string, args: string[]): Promise<CliRun> {
  const sandboxHome = join(SANDBOX, "home");
  const sandboxConfig = join(SANDBOX, "config");
  await mkdir(sandboxHome, { recursive: true });
  await mkdir(sandboxConfig, { recursive: true });
  const child = Bun.spawn([process.execPath, join(REPO_ROOT, "src", "cli.ts"), ...args], {
    cwd,
    env: {
      ...process.env,
      HOME: sandboxHome,
      XDG_CONFIG_HOME: sandboxConfig,
      XDG_CACHE_HOME: join(SANDBOX, "cache"),
      CI: "true",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe("install --decline-optional CLI", () => {
  test("help documents the option", async () => {
    const run = await runCli(SANDBOX, ["--help"]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("--decline-optional <id>");
  });

  test("records the declined state in the consumer manifest", async () => {
    const fixtureDir = await makeFixture("cli-declines");

    const run = await runCli(fixtureDir, [
      "install",
      "--scope",
      "local",
      "--decline-optional",
      "grilling",
    ]);

    expect(run.exitCode).toBe(0);
    const deps = await readDeps(fixtureDir);
    expect(deps.map(dep => [dep.id, dep.state])).toEqual([["grilling", "declined"]]);
  });

  test("accepts the option more than once", async () => {
    const fixtureDir = await makeFixture("cli-repeatable");

    const run = await runCli(fixtureDir, [
      "install",
      "--scope",
      "local",
      "--decline-optional",
      "grilling",
      "--decline-optional",
      "grilling",
    ]);

    expect(run.exitCode).toBe(0);
    const deps = await readDeps(fixtureDir);
    expect(deps.map(dep => [dep.id, dep.state])).toEqual([["grilling", "declined"]]);
  });

  test("an unknown id exits nonzero with a clear error and writes nothing", async () => {
    const fixtureDir = await makeFixture("cli-unknown");

    const run = await runCli(fixtureDir, [
      "install",
      "--scope",
      "local",
      "--decline-optional",
      "not-a-real-dep",
    ]);

    expect(run.exitCode).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain("not-a-real-dep");
    expect(await exists(join(fixtureDir, ".opencode"))).toBe(false);
  });
});
