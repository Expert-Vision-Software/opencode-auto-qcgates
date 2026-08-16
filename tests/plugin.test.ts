import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import plugin from "../plugin.ts";
import { detectAurelia } from "../src/installer.ts";

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
