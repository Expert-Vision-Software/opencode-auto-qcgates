import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import {
  applyOptionalDep,
  type CommandExecutor,
  type OptionalDepsContext,
} from "../src/optional-deps-actions.ts";
import type { PackageOptionalDep } from "../src/optional-deps.ts";

const TEST_DIR = join(import.meta.dirname, ".test-deps-actions");

const BASE_CTX: OptionalDepsContext = {
  scope: "local",
  configBase: "",
  configPath: "",
  manifestPath: "",
  packageDir: "",
};

function bundledSkillDep(): PackageOptionalDep {
  return {
    id: "fake-skill",
    kind: "skill",
    description: "d",
    source: { type: "bundled", path: "assets/skills/fake-skill" },
  };
}

function externalSkillDep(): PackageOptionalDep {
  return {
    id: "grilling",
    kind: "skill",
    description: "d",
    source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
  };
}

function pluginDep(): PackageOptionalDep {
  return {
    id: "some-plugin",
    kind: "plugin",
    description: "d",
    source: { type: "npm", package: "some-plugin" },
  };
}

function mcpCommandDep(): PackageOptionalDep {
  return {
    id: "some-mcp",
    kind: "mcp",
    description: "d",
    source: { type: "command", command: "some-mcp --serve" },
  };
}

function mcpUrlDep(): PackageOptionalDep {
  return {
    id: "remote-mcp",
    kind: "mcp",
    description: "d",
    source: { type: "url", url: "https://example.com/mcp" },
  };
}

function recordingExecutor(code = 0): {
  exec: CommandExecutor;
  calls: Array<{ command: string; args: string[]; cwd?: string }>;
} {
  const calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  return {
    calls,
    exec: async (command, args, options) => {
      calls.push({ command, args, cwd: options?.cwd });
      return code;
    },
  };
}

async function makeFixture(name: string): Promise<OptionalDepsContext> {
  const root = join(TEST_DIR, name);
  const configBase = join(root, ".opencode");
  const packageDir = join(root, "pkg");
  const fakeSkill = join(packageDir, "assets", "skills", "fake-skill");
  const fakeAgent = join(packageDir, "assets", "agents", "fake-agent");
  await mkdir(join(fakeSkill, "refs"), { recursive: true });
  await mkdir(fakeAgent, { recursive: true });
  await mkdir(configBase, { recursive: true });
  await writeFile(join(fakeSkill, "SKILL.md"), "fake skill body");
  await writeFile(join(fakeSkill, "refs", "detail.md"), "fake ref body");
  await writeFile(join(fakeAgent, "AGENT.md"), "fake agent body");
  return {
    ...BASE_CTX,
    scope: "local",
    configBase,
    configPath: join(configBase, "opencode.json"),
    manifestPath: join(configBase, "opencode-auto-qcgates.manifest.json"),
    packageDir,
  };
}

async function readConfig(ctx: OptionalDepsContext): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(ctx.configPath, "utf-8")) as Record<string, unknown>;
}

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("applyOptionalDep: bundled skill/agent", () => {
  test("copies a bundled skill into the scope configBase and returns hashed file entries", async () => {
    const ctx = await makeFixture("bundled-skill");
    const result = await applyOptionalDep(bundledSkillDep(), ctx);

    expect(result.ok).toBe(true);
    const copied = join(ctx.configBase, "skills", "fake-skill", "SKILL.md");
    expect(await Bun.file(copied).text()).toBe("fake skill body");
    expect(await Bun.file(join(ctx.configBase, "skills", "fake-skill", "refs", "detail.md")).text()).toBe(
      "fake ref body"
    );

    const paths = result.files.map(f => f.path).sort();
    expect(paths).toEqual(["skills/fake-skill/SKILL.md", "skills/fake-skill/refs/detail.md"]);
    for (const entry of result.files) {
      const hash = createHash("sha256").update(await readFile(join(ctx.configBase, entry.path))).digest("hex");
      expect(entry.hash).toBe(hash);
    }
  });

  test("copies a bundled agent into the agents group", async () => {
    const ctx = await makeFixture("bundled-agent");
    const dep: PackageOptionalDep = {
      id: "fake-agent",
      kind: "agent",
      description: "d",
      source: { type: "bundled", path: "assets/agents/fake-agent" },
    };
    const result = await applyOptionalDep(dep, ctx);

    expect(result.ok).toBe(true);
    expect(await Bun.file(join(ctx.configBase, "agents", "fake-agent", "AGENT.md")).text()).toBe("fake agent body");
    expect(result.files.map(f => f.path)).toEqual(["agents/fake-agent/AGENT.md"]);
  });

  test("a bundled source with a non-directory kind fails without writing", async () => {
    const ctx = await makeFixture("bundled-plugin");
    const dep: PackageOptionalDep = {
      id: "weird",
      kind: "plugin",
      description: "d",
      source: { type: "bundled", path: "assets/skills/fake-skill" },
    };
    const result = await applyOptionalDep(dep, ctx);

    expect(result.ok).toBe(false);
    expect(result.files).toEqual([]);
  });

  test("a missing bundled source path fails without writing", async () => {
    const ctx = await makeFixture("bundled-missing");
    const dep: PackageOptionalDep = {
      id: "ghost",
      kind: "skill",
      description: "d",
      source: { type: "bundled", path: "assets/skills/ghost" },
    };
    const result = await applyOptionalDep(dep, ctx);

    expect(result.ok).toBe(false);
    expect(await Bun.file(join(ctx.configBase, "skills", "ghost")).exists()).toBe(false);
  });
});

describe("applyOptionalDep: external-skill", () => {
  test("runs the documented installer command through the injected executor", async () => {
    const ctx = await makeFixture("external-skill");
    const { exec, calls } = recordingExecutor(0);
    const result = await applyOptionalDep(externalSkillDep(), ctx, exec);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("npx");
    expect(calls[0].args).toEqual(["-y", "skills", "add", "mattpocock/skills", "--skill", "grilling", "-a", "universal"]);
  });

  test("a non-zero exit code fails the action", async () => {
    const ctx = await makeFixture("external-skill-fail");
    const { exec, calls } = recordingExecutor(1);
    const result = await applyOptionalDep(externalSkillDep(), ctx, exec);

    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  test("local scope anchors the installer command to the project directory", async () => {
    const ctx = await makeFixture("external-skill-local");
    const { exec, calls } = recordingExecutor(0);

    await applyOptionalDep(externalSkillDep(), ctx, exec);

    expect(calls[0].cwd).toBe(dirname(ctx.configBase));
  });

  test("global scope anchors the installer command to the home directory", async () => {
    const ctx = await makeFixture("external-skill-global");
    ctx.scope = "global";
    const { exec, calls } = recordingExecutor(0);

    await applyOptionalDep(externalSkillDep(), ctx, exec);

    expect(calls[0].cwd).toBe(homedir());
  });
});

describe("applyOptionalDep: plugin", () => {
  test("merges the npm package into the config plugin array as name@latest", async () => {
    const ctx = await makeFixture("plugin");
    await writeFile(ctx.configPath, JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: ["other@1"] }));

    const result = await applyOptionalDep(pluginDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect(config["plugin"]).toEqual(["other@1", "some-plugin@latest"]);
  });

  test("is idempotent when the plugin is already present in any form", async () => {
    const ctx = await makeFixture("plugin-dup");
    await writeFile(ctx.configPath, JSON.stringify({ plugin: ["SOME-PLUGIN"] }));

    const result = await applyOptionalDep(pluginDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect(config["plugin"]).toEqual(["SOME-PLUGIN"]);
  });

  test("refuses to edit an unparseable config", async () => {
    const ctx = await makeFixture("plugin-bad-json");
    await writeFile(ctx.configPath, "{ not json");

    const result = await applyOptionalDep(pluginDep(), ctx);

    expect(result.ok).toBe(false);
    expect(await readFile(ctx.configPath, "utf-8")).toBe("{ not json");
  });
});

describe("applyOptionalDep: mcp", () => {
  test("merges a command source as a local mcp entry", async () => {
    const ctx = await makeFixture("mcp-command");
    const result = await applyOptionalDep(mcpCommandDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect(config["mcp"]).toEqual({
      "some-mcp": { type: "local", command: ["some-mcp", "--serve"], enabled: true },
    });
  });

  test("merges a url source as a remote mcp entry", async () => {
    const ctx = await makeFixture("mcp-url");
    const result = await applyOptionalDep(mcpUrlDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect(config["mcp"]).toEqual({
      "remote-mcp": { type: "remote", url: "https://example.com/mcp", enabled: true },
    });
  });

  test("keeps existing mcp entries and preserves unrelated config keys", async () => {
    const ctx = await makeFixture("mcp-preserve");
    await writeFile(
      ctx.configPath,
      JSON.stringify({ plugin: ["x"], mcp: { existing: { type: "remote", url: "https://a", enabled: true } } })
    );

    const result = await applyOptionalDep(mcpCommandDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect(config["plugin"]).toEqual(["x"]);
    expect((config["mcp"] as Record<string, unknown>)["existing"]).toEqual({
      type: "remote",
      url: "https://a",
      enabled: true,
    });
  });

  test("refuses to overwrite an existing mcp entry configured differently", async () => {
    const ctx = await makeFixture("mcp-conflict");
    await writeFile(ctx.configPath, JSON.stringify({ mcp: { "some-mcp": { type: "local", command: ["other"], enabled: true } } }));

    const result = await applyOptionalDep(mcpCommandDep(), ctx);

    expect(result.ok).toBe(false);
    const config = await readConfig(ctx);
    expect((config["mcp"] as Record<string, unknown>)["some-mcp"]).toEqual({
      type: "local",
      command: ["other"],
      enabled: true,
    });
  });

  test("reports already-configured when an identical entry exists", async () => {
    const ctx = await makeFixture("mcp-same");
    await writeFile(
      ctx.configPath,
      JSON.stringify({ mcp: { "some-mcp": { type: "local", command: ["some-mcp", "--serve"], enabled: true } } })
    );

    const result = await applyOptionalDep(mcpCommandDep(), ctx);

    expect(result.ok).toBe(true);
    const config = await readConfig(ctx);
    expect((config["mcp"] as Record<string, unknown>)["some-mcp"]).toEqual({
      type: "local",
      command: ["some-mcp", "--serve"],
      enabled: true,
    });
  });
});
