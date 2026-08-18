import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import plugin from "../plugin.ts";
import { detectAurelia, detectOptionalSkills } from "../src/installer.ts";

const TEST_DIR = join(import.meta.dirname, ".test-temp");

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true }).catch(() => {});
  await mkdir(TEST_DIR, { recursive: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true });
});

describe("TestBaseliningPlugin", () => {
  test("plugin returns config function", async () => {
    // @ts-ignore - PluginInput requires full context, we only need directory
    const result = await plugin({ directory: TEST_DIR });
    expect(result.config).toBeDefined();
    expect(typeof result.config).toBe("function");
  });

  test("installs skills and commands to target directory", async () => {
    // @ts-ignore - PluginInput requires full context, we only need directory
    const result = await plugin({ directory: TEST_DIR });
    // @ts-ignore - config returns async function that takes Config argument
    await (result.config as ((input: unknown) => Promise<void>) | undefined)?.({});

    const skillPath = join(TEST_DIR, ".opencode", "skills", "test-baselining", "SKILL.md");
    const commandPath = join(TEST_DIR, ".opencode", "commands", "test-baseline.md");

    expect(await exists(skillPath)).toBe(true);
    expect(await exists(commandPath)).toBe(true);

    const skillContent = await readFile(skillPath, "utf-8");
    expect(skillContent).toContain("# Test Baselining");

    const commandContent = await readFile(commandPath, "utf-8");
    expect(commandContent).toContain("test-baseline");
  });

  test("writes schema-compatible explore skill permissions", async () => {
    // @ts-ignore - PluginInput requires full context, we only need directory
    const pluginResult = await plugin({ directory: TEST_DIR });
    const input = {} as Record<string, unknown>;
    // @ts-ignore - config returns async function that takes Config argument
    await (pluginResult.config as ((input: unknown) => Promise<void>) | undefined)?.(input);

    const agent = (input as Record<string, unknown>).agent as Record<string, unknown> | undefined;
    expect(agent).toBeDefined();
    const explore = agent?.explore as Record<string, unknown> | undefined;
    expect(explore).toBeDefined();
    const permission = explore?.permission as Record<string, unknown> | undefined;
    expect(permission).toBeDefined();
    const skillPermissions = permission?.skill as Record<string, string> | undefined;
    expect(skillPermissions?.["test-baselining"]).toBe("allow");
    expect(skillPermissions?.["regression-checking"]).toBe("allow");
    expect(skillPermissions?.["grilling"]).toBe("allow");
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
