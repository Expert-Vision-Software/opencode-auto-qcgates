import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { InstallManifest } from "../src/manifest.ts";
import { manageDepsCommand, formatOptionalDepStates } from "../src/commands/manage-deps.ts";
import type { InstallOptionalDep } from "../src/optional-deps.ts";

const TEST_DIR = join(import.meta.dirname, ".test-deps-manage");
const PKG_VERSION = "1.5.0";

function externalDep(state: InstallOptionalDep["state"] = "pending"): InstallOptionalDep {
  return {
    id: "grilling",
    kind: "skill",
    description: "Interview loop",
    source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
    state,
  };
}

async function makeFixture(
  name: string,
  deps: InstallOptionalDep[]
): Promise<string> {
  const projectDir = join(TEST_DIR, name);
  const configBase = join(projectDir, ".opencode");
  await mkdir(configBase, { recursive: true });
  await InstallManifest.write(
    join(configBase, "opencode-auto-qcgates.manifest.json"),
    PKG_VERSION,
    [],
    deps
  );
  return projectDir;
}

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

async function readDepState(projectDir: string): Promise<string | undefined> {
  const manifest = await InstallManifest.read(
    join(projectDir, ".opencode", "opencode-auto-qcgates.manifest.json")
  );
  return manifest.optionalDependencies[0]?.state;
}

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("formatOptionalDepStates", () => {
  test("lists id, kind, and state per dependency", () => {
    const lines = formatOptionalDepStates([externalDep("declined")]);
    expect(lines).toEqual(["  grilling (skill): declined"]);
  });
});

describe("manageDepsCommand", () => {
  test("rejects when no scope can be resolved in a non-interactive session", async () => {
    await expect(manageDepsCommand({ interactive: false })).rejects.toThrow(/--scope/i);
  });

  test("reports when the package is not installed in the scope", async () => {
    const projectDir = join(TEST_DIR, "not-installed");
    await mkdir(projectDir, { recursive: true });
    const lines = await captureOutput(async () => {
      await manageDepsCommand({ scope: "local", interactive: false, projectDir });
    });
    expect(lines.join("\n")).toContain("not installed");
  });

  test("reports when no optional dependencies are declared", async () => {
    const projectDir = await makeFixture("no-deps", []);
    const lines = await captureOutput(async () => {
      await manageDepsCommand({ scope: "local", interactive: false, projectDir });
    });
    expect(lines.join("\n")).toContain("No optional dependencies");
  });

  test("a non-interactive session prints states without changing them", async () => {
    const projectDir = await makeFixture("nontty", [externalDep("pending")]);
    const lines = await captureOutput(async () => {
      await manageDepsCommand({ scope: "local", interactive: false, projectDir });
    });

    expect(lines.join("\n")).toContain("grilling (skill): pending");
    expect(await readDepState(projectDir)).toBe("pending");
  });

  test("an interactive session applies the selection — accepting a declined dep revisits it", async () => {
    const projectDir = await makeFixture("revisit", [externalDep("declined")]);
    const lines = await captureOutput(async () => {
      await manageDepsCommand({
        scope: "local",
        interactive: true,
        projectDir,
        select: async deps => deps.map(d => d.id),
        exec: async () => 0,
      });
    });

    expect(await readDepState(projectDir)).toBe("accepted");
    expect(lines.join("\n")).toContain("grilling");
  });
});
