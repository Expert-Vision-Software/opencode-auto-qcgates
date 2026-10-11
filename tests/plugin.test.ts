import { describe, test, expect, beforeAll, afterAll, spyOn } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { Effect, type Scope } from "effect";
import plugin from "../src/plugin.ts";
import type { Plugin } from "@opencode/plugin/effect";
import { detectAurelia, detectOptionalSkills, install } from "../src/installer.ts";
import { snapshotDirectory } from "./snapshot.ts";
import {
  SANDBOX_GLOBAL_BASE,
  resetGlobalConfig,
  withGlobalSandbox,
  writeGlobalPluginConfig,
} from "./global-sandbox.ts";

interface PluginDefinition {
  readonly id: string;
  readonly effect: (context: Plugin.Context) => Effect.Effect<void, never, Scope.Scope>;
}

const TEST_DIR = join(import.meta.dirname, ".test-temp");
process.env.XDG_CACHE_HOME = join(import.meta.dirname, ".test-xdg-cache");
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

interface FakeAgentRecord {
  id: string;
  name: string;
  permissions: Array<{ action: string; resource: string; effect: string }>;
}

interface FakeAgentRegistry {
  agents: FakeAgentRecord[];
  domain: Plugin.Context["agent"];
}

function makeAgentRegistry(): FakeAgentRegistry {
  const agents: FakeAgentRecord[] = [
    {
      id: "task",
      name: "task",
      permissions: [{ action: "skill", resource: "unrelated-skill", effect: "ask" }],
    },
  ];
  const editor = {
    list: () => agents,
    get: (id: string) => agents.find((agent) => agent.id === id),
    default: () => undefined,
    update: (id: string, update: (agent: FakeAgentRecord) => void) => {
      const agent = agents.find((item) => item.id === id);
      if (agent) {
        update(agent);
      }
    },
    remove: (id: string) => {
      const index = agents.findIndex((item) => item.id === id);
      if (index >= 0) {
        agents.splice(index, 1);
      }
    },
  };
  const domain = {
    transform: (callback: (input: typeof editor) => void) =>
      Effect.sync(() => {
        callback(editor);
        return { dispose: Effect.void };
      }),
  };
  return { agents, domain: domain as unknown as Plugin.Context["agent"] };
}

function makePluginContext(directory: string, registry: FakeAgentRegistry): Plugin.Context {
  return {
    location: { directory },
    agent: registry.domain,
  } as unknown as Plugin.Context;
}

async function loadPluginSession(session: string): Promise<{ default: PluginDefinition }> {
  return import(`../src/plugin.ts?session=${session}`);
}

function runLoadCycle(
  module: PluginDefinition,
  fixtureDir: string,
  registry: FakeAgentRegistry
): Promise<void> {
  return Effect.runPromise(Effect.scoped(module.effect(makePluginContext(fixtureDir, registry))));
}

async function invokeLoadCycle(session: string, fixtureDir: string): Promise<FakeAgentRegistry> {
  const registry = makeAgentRegistry();
  const loaded = await loadPluginSession(session);
  await runLoadCycle(loaded.default, fixtureDir, registry);
  return registry;
}

function expectSkillPermissions(registry: FakeAgentRegistry): void {
  const task = registry.agents.find((agent) => agent.id === "task");
  expect(task).toBeDefined();
  const permissions = task?.permissions ?? [];
  for (const resource of ["test-baselining", "regression-checking", "grilling"]) {
    const rules = permissions.filter((rule) => rule.action === "skill" && rule.resource === resource);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.effect).toBe("allow");
  }
  const foreign = permissions.filter((rule) => rule.resource === "unrelated-skill");
  expect(foreign).toHaveLength(1);
  expect(foreign[0]?.effect).toBe("ask");
}

function captureConsoleWarnings(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = [];
  const spy = spyOn(console, "warn").mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
  return { warnings, restore: () => spy.mockRestore() };
}

describe("TestBaseliningPlugin", () => {
  test("plugin definition exposes a stable id and an effect", () => {
    expect(plugin.id).toBe(PACKAGE_NAME);
    expect(typeof plugin.effect).toBe("function");
  });

  test("unregistered repo with nothing installed: load cycle performs zero disk writes", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("zero-write-repo");

      const before = await snapshotDirectory(fixtureDir);
      await invokeLoadCycle("zero-write", fixtureDir);
      const after = await snapshotDirectory(fixtureDir);

      expect(after).toEqual(before);
      expect(Object.keys(after)).toEqual([]);
      expect(await exists(SANDBOX_GLOBAL_BASE)).toBe(false);
    });
  });

  test("repo-local registration: ensures repo content and preserves the config file byte-for-byte", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-local-ensure");
      const configPath = join(fixtureDir, ".opencode", "opencode.json");
      await mkdir(join(fixtureDir, ".opencode"), { recursive: true });
      const configContent = JSON.stringify(
        { $schema: "https://opencode.ai/config.json", model: "some/model", plugins: [PACKAGE_NAME] },
        null,
        2
      );
      await writeFile(configPath, configContent);

      const registry = await invokeLoadCycle("repo-local-ensure", fixtureDir);

      expect(await readFile(configPath, "utf-8")).toBe(configContent);
      expect(await exists(join(fixtureDir, ".opencode", "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(fixtureDir, ".opencode", "commands", "test-baseline.md"))).toBe(true);
      expect(await exists(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expectSkillPermissions(registry);
    });
  });

  test("global registration: writes land only under the global config dir, repo untouched", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-fresh");
      const repoBefore = await snapshotDirectory(fixtureDir);

      await invokeLoadCycle("global-fresh", fixtureDir);

      expect(await snapshotDirectory(fixtureDir)).toEqual(repoBefore);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "commands", "test-baseline.md"))).toBe(true);
    });
  });

  test("global registration via opencode.jsonc: writes land only under the global config dir, repo untouched", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      const jsoncContent = [
        "{",
        "  // pinned globally so every project gets the quality gates",
        '  "$schema": "https://opencode.ai/config.json",',
        '  "model": "some/model",',
        '  "plugins": [',
        `    "${PACKAGE_NAME}@1.5.0",`,
        "  ],",
        "}",
      ].join("\n");
      await writeFile(join(SANDBOX_GLOBAL_BASE, "opencode.jsonc"), jsoncContent);
      const fixtureDir = await makeFixture("global-jsonc-context-fresh");
      const repoBefore = await snapshotDirectory(fixtureDir);

      await invokeLoadCycle("global-jsonc-fresh", fixtureDir);

      expect(await readFile(join(SANDBOX_GLOBAL_BASE, "opencode.jsonc"), "utf-8")).toBe(jsoncContent);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "opencode.json"))).toBe(false);
      expect(await snapshotDirectory(fixtureDir)).toEqual(repoBefore);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "commands", "test-baseline.md"))).toBe(true);
    });
  });

  test("repo-local registration via .opencode/opencode.jsonc: content ensured, jsonc file preserved byte-for-byte", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-local-jsonc-ensure");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const jsoncContent = JSON.stringify(
        { $schema: "https://opencode.ai/config.json", model: "some/model", plugins: [PACKAGE_NAME] },
        null,
        2
      );
      const jsoncPath = join(localDir, "opencode.jsonc");
      await writeFile(jsoncPath, jsoncContent);

      const registry = await invokeLoadCycle("repo-local-jsonc-ensure", fixtureDir);

      expect(await readFile(jsoncPath, "utf-8")).toBe(jsoncContent);
      expect(await exists(join(localDir, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(localDir, "commands", "test-baseline.md"))).toBe(true);
      expect(await exists(join(localDir, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expectSkillPermissions(registry);
    });
  });

  test("load cycle survives an install failure caused by a blocked destination: degrades to a warn, never rejects", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("hook-degrade-install-failure");
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      await writeFile(join(SANDBOX_GLOBAL_BASE, "skills"), "not a directory");

      const { warnings, restore } = captureConsoleWarnings();
      try {
        const registry = await invokeLoadCycle("blocked-destination", fixtureDir);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("startup self-ensure failed");
        expect(warnings[0]).toContain("bunx opencode-auto-qcgates install --scope global");
        expect(warnings[0]).toContain(`opencode/npm/${PACKAGE_NAME}@`);
        expectSkillPermissions(registry);
      } finally {
        restore();
      }
    });
  });

  test("global registration steady state: second load is a zero-write no-op", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-steady");

      await invokeLoadCycle("steady-1", fixtureDir);
      const globalBefore = await snapshotDirectory(SANDBOX_GLOBAL_BASE);
      const repoBefore = await snapshotDirectory(fixtureDir);

      await invokeLoadCycle("steady-2", fixtureDir);

      expect(await snapshotDirectory(SANDBOX_GLOBAL_BASE)).toEqual(globalBefore);
      expect(await snapshotDirectory(fixtureDir)).toEqual(repoBefore);
    });
  });

  test("global registration version drift: updates the global scope only", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-drift");

      await invokeLoadCycle("global-drift-1", fixtureDir);
      const manifestPath = join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`);
      const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
      manifest.version = "0.0.1";
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      const repoBefore = await snapshotDirectory(fixtureDir);

      await invokeLoadCycle("global-drift-2", fixtureDir);

      const rewritten = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
      expect(rewritten.version).not.toBe("0.0.1");
      expect(await snapshotDirectory(fixtureDir)).toEqual(repoBefore);
    });
  });

  test("repo-root opencode.json registration: root file never touched, content under .opencode", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-root-registration");
      const rootConfigPath = join(fixtureDir, "opencode.json");
      const rootContent = JSON.stringify(
        { $schema: "https://opencode.ai/config.json", model: "some/model", plugins: [PACKAGE_NAME] },
        null,
        2
      );
      await writeFile(rootConfigPath, rootContent);

      await invokeLoadCycle("repo-root", fixtureDir);

      expect(await readFile(rootConfigPath, "utf-8")).toBe(rootContent);
      expect(await exists(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(fixtureDir, ".opencode", "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(fixtureDir, ".opencode", "opencode.json"))).toBe(false);
    });
  });

  test("repo-root registration with a foreign plugin while globally registered: global ensured, root untouched", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-root-foreign");
      const rootConfigPath = join(fixtureDir, "opencode.json");
      const rootContent = JSON.stringify(
        { $schema: "https://opencode.ai/config.json", plugins: ["opencode-architect"] },
        null,
        2
      );
      await writeFile(rootConfigPath, rootContent);
      const repoBefore = await snapshotDirectory(fixtureDir);

      await invokeLoadCycle("root-foreign", fixtureDir);

      expect(await readFile(rootConfigPath, "utf-8")).toBe(rootContent);
      expect(await snapshotDirectory(fixtureDir)).toEqual(repoBefore);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
    });
  });

  test("repo-local registration with an unparseable nested config: content ensured, invalid file preserved", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-local-invalid-config");
      const rootConfigPath = join(fixtureDir, "opencode.json");
      await writeFile(
        rootConfigPath,
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const invalidContent =
        '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [\n    "opencode-architect"\n  ],\n}';
      const invalidPath = join(localDir, "opencode.json");
      await writeFile(invalidPath, invalidContent);

      await invokeLoadCycle("repo-local-invalid", fixtureDir);

      expect(await readFile(invalidPath, "utf-8")).toBe(invalidContent);
      expect(await exists(join(localDir, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(localDir, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
    });
  });

  test("both scopes registered: both ensured with no cross-scope leakage", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("both-scopes");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );

      await invokeLoadCycle("both-scopes", fixtureDir);

      expect(await exists(join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(SANDBOX_GLOBAL_BASE, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(localDir, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
      expect(await exists(join(localDir, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      const globalConfig = JSON.parse(
        await readFile(join(SANDBOX_GLOBAL_BASE, "opencode.json"), "utf-8")
      ) as Record<string, unknown>;
      expect(globalConfig["plugins"]).toEqual([PACKAGE_NAME]);
    });
  });

  test("repo-local version drift: updates the repo scope only, global untouched", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-local-drift");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      await invokeLoadCycle("local-drift-1", fixtureDir);
      const manifestPath = join(localDir, `${PACKAGE_NAME}.manifest.json`);
      const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
      manifest.version = "0.0.1";
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      await invokeLoadCycle("local-drift-2", fixtureDir);

      const rewritten = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
      expect(rewritten.version).not.toBe("0.0.1");
      expect(await exists(SANDBOX_GLOBAL_BASE)).toBe(false);
    });
  });

  test("global context with a valid local config lacking our plugin entry: zero repo writes", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-local-config");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const configContent = JSON.stringify(
        { $schema: "https://opencode.ai/config.json", plugins: ["opencode-architect"] },
        null,
        2
      );
      await writeFile(join(localDir, "opencode.json"), configContent);

      await invokeLoadCycle("global-local-foreign", fixtureDir);

      expect(await readFile(join(localDir, "opencode.json"), "utf-8")).toBe(configContent);
      expect(await exists(join(localDir, "skills"))).toBe(false);
      expect(await exists(join(localDir, `${PACKAGE_NAME}.manifest.json`))).toBe(false);
    });
  });

  test("global context with an unparseable local config: zero repo writes, file preserved", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-context-invalid-local");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const invalidContent =
        '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [\n    "opencode-architect"\n  ],\n}';
      await writeFile(join(localDir, "opencode.json"), invalidContent);

      await invokeLoadCycle("global-invalid-local", fixtureDir);

      expect(await readFile(join(localDir, "opencode.json"), "utf-8")).toBe(invalidContent);
      expect(await exists(join(localDir, "skills"))).toBe(false);
    });
  });

  test("foreign-plugin local config: zero writes, config file preserved, task ruleset still seeded", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("merge-overrides-repo");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const configContent = JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          model: "some/model",
          plugins: ["opencode-architect"],
        },
        null,
        2
      );
      await writeFile(join(localDir, "opencode.json"), configContent);

      const registry = await invokeLoadCycle("merge-overrides", fixtureDir);

      expect(await readFile(join(localDir, "opencode.json"), "utf-8")).toBe(configContent);
      expectSkillPermissions(registry);
    });
  });

  test("registers the task agent skill ruleset in memory", async () => {
    const registry = await invokeLoadCycle("task-ruleset", TEST_DIR);
    expectSkillPermissions(registry);
  });
});

interface ReproScenario {
  name: string;
  setup: (dir: string) => Promise<void>;
}

const REPRO_SCENARIOS: ReproScenario[] = [
  { name: "A-fresh-repo-no-config", setup: async () => {} },
  {
    name: "B-repo-with-root-opencode-json",
    setup: async dir => {
      await writeFile(
        join(dir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", model: "some/model" }, null, 2)
      );
    },
  },
  {
    name: "C-repo-valid-local-config-without-plugin",
    setup: async dir => {
      const localDir = join(dir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: ["opencode-architect"] }, null, 2)
      );
    },
  },
  {
    name: "D-repo-invalid-local-config-trailing-comma",
    setup: async dir => {
      const localDir = join(dir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [\n    "opencode-architect"\n  ],\n}'
      );
    },
  },
  {
    name: "E-control-repo-up-to-date-local",
    setup: async dir => {
      const localDir = join(dir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: ["opencode-auto-qcgates"] }, null, 2)
      );
      await install("local", dir, { addPluginConfig: false, migrateRootConfig: false, force: false });
    },
  },
];

describe("load cycle repro scenarios ported from qcgates-repro", () => {
  const scenariosDir = join(import.meta.dirname, ".test-scenarios");

  beforeAll(async () => {
    await rm(scenariosDir, { recursive: true, force: true });
    await mkdir(scenariosDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(scenariosDir, { recursive: true, force: true });
  });

  for (const scenario of REPRO_SCENARIOS) {
    test(`scenario ${scenario.name} produces zero repo disk writes from the load cycle`, async () => {
      await withGlobalSandbox(async () => {
        await resetGlobalConfig();
        const fixtureDir = join(scenariosDir, scenario.name);
        await mkdir(fixtureDir, { recursive: true });
        await scenario.setup(fixtureDir);

        const before = await snapshotDirectory(fixtureDir);
        await invokeLoadCycle(`scenario-${scenario.name}`, fixtureDir);
        const after = await snapshotDirectory(fixtureDir);

        expect(after).toEqual(before);
      });
    });
  }

  test("scenario E control still receives the in-memory task skill ruleset", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = join(scenariosDir, "E-control-repo-up-to-date-local");
      const registry = await invokeLoadCycle("scenario-E-control", fixtureDir);
      expectSkillPermissions(registry);
    });
  });
});

describe("install advisory (one-shot)", () => {
  test("nothing installed anywhere: emits exactly one warn and zero writes", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("advisory-fires");
      const { warnings, restore } = captureConsoleWarnings();
      const before = await snapshotDirectory(fixtureDir);

      try {
        await invokeLoadCycle("advisory-fires", fixtureDir);

        expect(await snapshotDirectory(fixtureDir)).toEqual(before);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("is not installed in any scope");
        expect(warnings[0]).toContain("bunx opencode-auto-qcgates install --scope global");
      } finally {
        restore();
      }
    });
  });

  test("the advisory fires at most once per plugin session", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("advisory-once-per-session");
      const { warnings, restore } = captureConsoleWarnings();

      try {
        const module = await loadPluginSession("advisory-once");
        const definition = module.default;
        await runLoadCycle(definition, fixtureDir, makeAgentRegistry());
        await runLoadCycle(definition, fixtureDir, makeAgentRegistry());
        await runLoadCycle(definition, fixtureDir, makeAgentRegistry());

        expect(warnings.filter(w => w.includes("is not installed in any scope"))).toHaveLength(1);
      } finally {
        restore();
      }
    });
  });

  test("an installed scope present: no advisory even when the plugin is unregistered", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("advisory-suppressed");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: ["opencode-architect"] }, null, 2)
      );
      await install("local", fixtureDir, { addPluginConfig: false, migrateRootConfig: false, force: false });

      const { warnings, restore } = captureConsoleWarnings();
      const before = await snapshotDirectory(fixtureDir);
      try {
        await invokeLoadCycle("advisory-suppressed", fixtureDir);

        expect(warnings).toHaveLength(0);
        expect(await snapshotDirectory(fixtureDir)).toEqual(before);
      } finally {
        restore();
      }
    });
  });
});

describe("failure advisory (one-shot)", () => {
  test("three failing load cycles emit exactly one failure advisory, and the D5 advisory still fires independently in a later session", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const failingDir = await makeFixture("failure-advisory-once");
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      await writeFile(join(SANDBOX_GLOBAL_BASE, "skills"), "not a directory");

      const { warnings, restore } = captureConsoleWarnings();
      try {
        const failingModule = await loadPluginSession("failure-once");
        const failingDefinition = failingModule.default;
        await runLoadCycle(failingDefinition, failingDir, makeAgentRegistry());
        await runLoadCycle(failingDefinition, failingDir, makeAgentRegistry());
        await runLoadCycle(failingDefinition, failingDir, makeAgentRegistry());

        const failureWarnings = warnings.filter(w => w.includes("startup self-ensure failed"));
        expect(failureWarnings).toHaveLength(1);
        expect(failureWarnings[0]).toContain("bunx opencode-auto-qcgates install --scope global");

        await resetGlobalConfig();
        const freshDir = await makeFixture("failure-advisory-d5-independent");
        const freshModule = await loadPluginSession("failure-d5-later");
        await runLoadCycle(freshModule.default, freshDir, makeAgentRegistry());

        const d5Warnings = warnings.filter(w => w.includes("is not installed in any scope"));
        expect(d5Warnings).toHaveLength(1);
      } finally {
        restore();
      }
    });
  });
});

describe("legacy singular plugin key upgrade advisory", () => {
  test("a legacy-only repo: the load cycle fires the upgrade advisory once and performs zero writes", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("legacy-hook-advisory");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const legacyContent = `{\n  "plugin": ["${PACKAGE_NAME}"]\n}\n`;
      const legacyPath = join(localDir, "opencode.json");
      await writeFile(legacyPath, legacyContent);

      const warnings: string[] = [];
      const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      try {
        await invokeLoadCycle("legacy-1", fixtureDir);
        await invokeLoadCycle("legacy-2", fixtureDir);
      } finally {
        warn.mockRestore();
      }

      const advisories = warnings.filter(w => w.includes("legacy and inert under OpenCode v2"));
      expect(advisories.length).toBe(1);
      expect(advisories[0]).toContain(legacyPath);
      expect(await readFile(legacyPath, "utf-8")).toBe(legacyContent);
      expect(await exists(join(localDir, "skills"))).toBe(false);
    });
  });

  test("a v2 plugins registration alongside a legacy key: load ensures assets, keeps both keys, and advises once", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("both-keys-hook");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const configContent = [
        "{",
        `  "plugin": ["${PACKAGE_NAME}"],`,
        `  "plugins": ["${PACKAGE_NAME}"]`,
        "}",
        "",
      ].join("\n");
      const configPath = join(localDir, "opencode.json");
      await writeFile(configPath, configContent);

      const warnings: string[] = [];
      const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      try {
        await invokeLoadCycle("both-keys", fixtureDir);
      } finally {
        warn.mockRestore();
      }

      expect(await readFile(configPath, "utf-8")).toBe(configContent);
      expect(warnings.filter(w => w.includes("legacy and inert under OpenCode v2")).length).toBe(1);
      expect(await exists(join(localDir, "skills", "test-baselining", "SKILL.md"))).toBe(true);
      expect(await exists(join(localDir, `${PACKAGE_NAME}.manifest.json`))).toBe(true);
    });
  });
});

describe("detectAurelia", () => {
  const aureliaDir = join(import.meta.dirname, ".test-aurelia");

  beforeAll(async () => {
    await rm(aureliaDir, { recursive: true }).catch(() => {});
    await mkdir(aureliaDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(aureliaDir, { recursive: true });
  });

  test("returns false when package.json is missing", async () => {
    const emptyDir = join(import.meta.dirname, ".test-empty");
    await rm(emptyDir, { recursive: true }).catch(() => {});
    await mkdir(emptyDir, { recursive: true });
    try {
      const result = await detectAurelia(emptyDir);
      expect(result.detected).toBe(false);
      expect(result.message).toBe("");
    } finally {
      await rm(emptyDir, { recursive: true });
    }
  });

  test("returns false for a non-Aurelia project", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({ name: "demo", dependencies: { react: "^18.0.0" } })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(false);
  });

  test("returns true for `aurelia` in dependencies", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: { aurelia: "^2.0.0", something: "^1.0.0" },
      })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
    expect(result.message).toContain("aurelia-expert");
  });

  test("returns true for `@aurelia/runtime` in devDependencies", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({
        name: "demo",
        devDependencies: { "@aurelia/runtime": "^2.0.0" },
      })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
  });

  test("returns true for an Aurelia package in peerDependencies", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({
        name: "demo",
        peerDependencies: { "@aurelia/kernel": "^2.0.0" },
      })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
  });

  test("returns true for an Aurelia package in optionalDependencies", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({
        name: "demo",
        optionalDependencies: { "@aurelia/runtime-html": "^2.0.0" },
      })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
  });

  test("detects the literal `aureliajs` token defensively", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({ name: "demo", dependencies: { aureliajs: "*" } })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
  });

  test("surfaces only the two install paths the spec asked for", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({ name: "demo", dependencies: { "@aurelia/kernel": "^2.0.0" } })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.detected).toBe(true);
    expect(result.message).toContain("aurelia-expert");
    expect(result.message).toContain("opencode.json");
    expect(result.message).toContain('"plugins"');
    expect(result.message).not.toContain('"plugin":');
    expect(result.message).toContain("npx skills add");
    expect(result.message).not.toContain("bunx aurelia-expert install");
    expect(result.message).not.toContain("npx aurelia-expert install");
  });

  test("message never claims the skills are `framework-agnostic`", async () => {
    await writeFile(
      join(aureliaDir, "package.json"),
      JSON.stringify({ name: "demo", dependencies: { "@aurelia/kernel": "^2.0.0" } })
    );
    const result = await detectAurelia(aureliaDir);
    expect(result.message).not.toMatch(/framework-agnostic/);
    expect(result.message).toMatch(/VCS-agnostic/);
    expect(result.message).toMatch(/language agnostic/);
  });
});

describe("detectOptionalSkills", () => {
  const fixturesRoot = join(import.meta.dirname, ".test-optional-skills");

  beforeAll(async () => {
    await rm(fixturesRoot, { recursive: true }).catch(() => {});
    await mkdir(fixturesRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(fixturesRoot, { recursive: true });
  });

  test("returns empty array when `grilling` is already installed at the config base", async () => {
    const configBase = join(fixturesRoot, "with-grilling");
    await rm(configBase, { recursive: true }).catch(() => {});
    await mkdir(join(configBase, "skills", "grilling"), { recursive: true });
    await writeFile(join(configBase, "skills", "grilling", "SKILL.md"), "---\nname: grilling\n---\n");

    const recs = await detectOptionalSkills(configBase);
    expect(recs).toEqual([]);
  });

  test("returns a grilling recommendation when absent, with both install modes", async () => {
    const configBase = join(fixturesRoot, "without-grilling");
    await rm(configBase, { recursive: true }).catch(() => {});
    await mkdir(configBase, { recursive: true });

    const recs = await detectOptionalSkills(configBase);
    expect(recs.length).toBeGreaterThanOrEqual(1);
    const joined = recs.join("\n");
    expect(joined).toContain("grilling");
    expect(joined).toContain("mattpocock/skills");
    // one-shot inline fetch
    expect(joined).toContain("CI=true npx -y skills use");
    // permanent install
    expect(joined).toContain("npx -y skills add");
    // default agent placeholder
    expect(joined).toContain("-a universal");
  });

  test("the recommendation names the trigger that loads grilling", async () => {
    const configBase = join(fixturesRoot, "trigger-words");
    await rm(configBase, { recursive: true }).catch(() => {});
    await mkdir(configBase, { recursive: true });

    const recs = await detectOptionalSkills(configBase);
    const joined = recs.join("\n");
    // mentions the no-manifest / can't-infer trigger so the user understands why
    expect(joined).toMatch(/init|interview|tier/i);
    expect(joined).toMatch(/manifest|inferred|infer/i);
  });

  test("the recommendation is purely advisory — never references `opencode.json` mutations", async () => {
    const configBase = join(fixturesRoot, "advisory-shape");
    await rm(configBase, { recursive: true }).catch(() => {});
    await mkdir(configBase, { recursive: true });

    const recs = await detectOptionalSkills(configBase);
    const joined = recs.join("\n");
    // The recommendation should NOT pretend to auto-install or modify config
    expect(joined).not.toMatch(/opencode\.json/);
    expect(joined).not.toMatch(/plugin.*add/i);
    expect(joined).not.toMatch(/will install/i);
  });
});
