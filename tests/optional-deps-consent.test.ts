import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { InstallManifest } from "../src/manifest.ts";
import {
  applyOptionalDepDecisions,
  runOptionalDepsConsent,
  type CommandExecutor,
  type OptionalDepsContext,
} from "../src/optional-deps-actions.ts";
import type { InstallOptionalDep, PackageOptionalDep } from "../src/optional-deps.ts";

const TEST_DIR = join(import.meta.dirname, ".test-deps-consent");
const PKG_VERSION = "1.5.0";

function bundledDep(): PackageOptionalDep {
  return {
    id: "fake-skill",
    kind: "skill",
    description: "d",
    source: { type: "bundled", path: "assets/skills/fake-skill" },
  };
}

function otherDep(state: InstallOptionalDep["state"] = "pending"): InstallOptionalDep {
  return {
    id: "grilling",
    kind: "skill",
    description: "d",
    source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
    state,
  };
}

async function makeFixture(
  name: string,
  deps: InstallOptionalDep[]
): Promise<OptionalDepsContext> {
  const root = join(TEST_DIR, name);
  const configBase = join(root, ".opencode");
  const packageDir = join(root, "pkg");
  const fakeSkill = join(packageDir, "assets", "skills", "fake-skill");
  await mkdir(fakeSkill, { recursive: true });
  await mkdir(configBase, { recursive: true });
  await writeFile(join(fakeSkill, "SKILL.md"), "fake skill body");
  const manifestPath = join(configBase, "opencode-auto-qcgates.manifest.json");
  await InstallManifest.write(manifestPath, PKG_VERSION, [{ path: "keep.txt", hash: "abc123" }], deps);
  return {
    scope: "local",
    configBase,
    configPath: join(configBase, "opencode.json"),
    manifestPath,
    packageDir,
    packageName: "opencode-auto-qcgates",
  };
}

async function readDeps(ctx: OptionalDepsContext): Promise<InstallOptionalDep[]> {
  const manifest = await InstallManifest.read(ctx.manifestPath);
  return manifest.optionalDependencies;
}

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("applyOptionalDepDecisions", () => {
  test("an accepted bundled dep is applied, marked accepted, and its files are hash-recorded", async () => {
    const ctx = await makeFixture("accept-bundled", [{ ...bundledDep(), state: "pending" }]);

    const result = await applyOptionalDepDecisions(ctx, [{ ...bundledDep(), state: "pending" }], ["fake-skill"]);

    expect(result.applied.map(a => a.id)).toEqual(["fake-skill"]);
    expect(result.declined).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.changed).toBe(true);

    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("accepted");
    const manifest = await InstallManifest.read(ctx.manifestPath);
    const paths = manifest.files.map(f => f.path).sort();
    expect(paths).toContain("keep.txt");
    expect(paths).toContain("skills/fake-skill/SKILL.md");
    const recorded = manifest.files.find(f => f.path === "skills/fake-skill/SKILL.md");
    const expectedHash = await InstallManifest.hashFile(join(ctx.configBase, "skills/fake-skill/SKILL.md"));
    expect(recorded?.hash).not.toBeUndefined();
    expect(recorded?.hash).toBe(expectedHash!);
  });

  test("an unchecked pending dep is recorded declined (sticky)", async () => {
    const ctx = await makeFixture("decline", [otherDep("pending")]);

    const result = await applyOptionalDepDecisions(ctx, [otherDep("pending")], []);

    expect(result.declined).toEqual(["grilling"]);
    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("declined");
  });

  test("unchecking an accepted dep does not revoke it", async () => {
    const ctx = await makeFixture("keep-accepted", [otherDep("accepted")]);

    const result = await applyOptionalDepDecisions(ctx, [otherDep("accepted")], []);

    expect(result.declined).toEqual([]);
    expect(result.changed).toBe(false);
    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("accepted");
  });

  test("a failed action keeps the dep pending and reports the reason", async () => {
    const dep = { ...bundledDep(), source: { type: "bundled" as const, path: "assets/skills/ghost" }, state: "pending" as const };
    const ctx = await makeFixture("failure", [dep]);
    const exec: CommandExecutor = async () => 0;

    const result = await applyOptionalDepDecisions(ctx, [dep], ["fake-skill"], exec);

    expect(result.applied).toEqual([]);
    expect(result.failed).toEqual([{ id: "fake-skill", reason: expect.stringContaining("not found") }]);
    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("pending");
  });

  test("declining an already-declined dep is a no-op write", async () => {
    const ctx = await makeFixture("decline-again", [otherDep("declined")]);
    const before = await readFile(ctx.manifestPath, "utf-8");

    const result = await applyOptionalDepDecisions(ctx, [otherDep("declined")], []);

    expect(result.declined).toEqual([]);
    expect(result.changed).toBe(false);
    expect(await readFile(ctx.manifestPath, "utf-8")).toBe(before);
  });

  test("the executor is only invoked for accepted external-skill deps", async () => {
    const ctx = await makeFixture("exec-only-accepted", [otherDep("pending")]);
    const calls: string[] = [];
    const exec: CommandExecutor = async (command, args) => {
      calls.push(`${command} ${args.join(" ")}`);
      return 0;
    };

    await applyOptionalDepDecisions(ctx, [otherDep("pending")], [], exec);

    expect(calls).toEqual([]);
  });
});

async function captureOutput(operation: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (message: unknown) => {
    lines.push(String(message));
  };
  try {
    await operation();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

describe("runOptionalDepsConsent", () => {
  test("no pending deps skips the flow entirely", async () => {
    const ctx = await makeFixture("gate-none", [otherDep("declined")]);

    const result = await runOptionalDepsConsent(ctx, [otherDep("declined")], { interactive: true });

    expect(result).toBeNull();
    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("declined");
  });

  test("a non-interactive session skips prompts, leaves state pending, and explains why", async () => {
    const dep = otherDep("pending");
    const ctx = await makeFixture("gate-nontty", [dep]);

    let selected = false;
    const lines = await captureOutput(async () => {
      const result = await runOptionalDepsConsent(ctx, [dep], {
        interactive: false,
        select: async () => {
          selected = true;
          return [];
        },
      });
      expect(result).toBeNull();
    });

    expect(selected).toBe(false);
    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("pending");
    expect(lines.join("\n")).toContain("grilling");
    expect(lines.join("\n")).toContain("Non-interactive");
  });

  test("an interactive session applies the checkbox selection and reports outcomes", async () => {
    const dep = otherDep("pending");
    const ctx = await makeFixture("gate-tty", [dep]);
    const exec: CommandExecutor = async () => 0;
    const lines = await captureOutput(async () => {
      const result = await runOptionalDepsConsent(ctx, [dep], {
        interactive: true,
        select: async pending => pending.map(d => d.id),
        exec,
      });
      expect(result?.applied.map(a => a.id)).toEqual(["grilling"]);
    });

    const deps = await readDeps(ctx);
    expect(deps[0].state).toBe("accepted");
    expect(lines.join("\n")).toContain("grilling");
  });
});
