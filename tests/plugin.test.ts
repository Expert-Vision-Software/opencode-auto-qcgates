import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, readFile } from "node:fs/promises";
import plugin from "../plugin.ts";

const TEST_DIR = join(import.meta.dirname, ".test-temp");

beforeAll(async () => {
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
    // @ts-ignore - config returns async function
    await (result.config as (() => Promise<void>) | undefined)?.();

    const skillPath = join(TEST_DIR, ".opencode", "skills", "test-baselining", "SKILL.md");
    const commandPath = join(TEST_DIR, ".opencode", "commands", "test-baseline.md");

    expect(await exists(skillPath)).toBe(true);
    expect(await exists(commandPath)).toBe(true);

    const skillContent = await readFile(skillPath, "utf-8");
    expect(skillContent).toContain("Test Baselining Skill");

    const commandContent = await readFile(commandPath, "utf-8");
    expect(commandContent).toContain("test-baseline");
  });
});
