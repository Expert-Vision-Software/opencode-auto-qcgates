import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { exists, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import {
  getContentDeclaration,
  install,
  isScopeInstalled,
  migrateRootConfig,
  resolveMode,
  resolvePackageDir,
  status,
  uninstall,
} from "../src/installer.ts";
import { PluginNameNormalizer } from "../src/plugin-name.ts";
import { InstallManifest } from "../src/manifest.ts";
import { BundledAssetsMissingError } from "../src/bundled-assets-missing-error.ts";
import { CopyModeUnsupportedError } from "../src/copy-mode-unsupported-error.ts";
import { CacheCleaner } from "../src/cache-cleaner.ts";
import { snapshotDirectory } from "./snapshot.ts";
import { SANDBOX_GLOBAL_BASE, resetGlobalConfig, withGlobalSandbox } from "./global-sandbox.ts";

const TEST_DIR = join(import.meta.dirname, ".test-install");
const SANDBOX_CACHE = join(import.meta.dirname, ".test-cache");
process.env.XDG_CACHE_HOME = SANDBOX_CACHE;
const PACKAGE_NAME = "opencode-auto-qcgates";
const CANONICAL_PLUGIN_REF = `${PACKAGE_NAME}@latest`;

beforeAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });
  await rm(SANDBOX_CACHE, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await rm(SANDBOX_CACHE, { recursive: true, force: true });
});

async function makeFixture(name: string): Promise<string> {
  const fixtureDir = join(TEST_DIR, name);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  return fixtureDir;
}

async function writeLocalConfig(fixtureDir: string, config: Record<string, unknown>): Promise<void> {
  const localDir = join(fixtureDir, ".opencode");
  await mkdir(localDir, { recursive: true });
  await writeFile(join(localDir, "opencode.json"), JSON.stringify(config, null, 2));
}

async function readLocalConfigRaw(fixtureDir: string): Promise<string> {
  return readFile(join(fixtureDir, ".opencode", "opencode.json"), "utf-8");
}

async function readPluginArray(fixtureDir: string): Promise<string[]> {
  const config = JSON.parse(await readLocalConfigRaw(fixtureDir)) as Record<string, unknown>;
  return (config["plugin"] as string[]) ?? [];
}

async function captureWarnings(operation: () => Promise<void>): Promise<string[]> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: unknown) => {
    warnings.push(String(message));
  };
  try {
    await operation();
  } finally {
    console.warn = originalWarn;
  }
  return warnings;
}

const INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false } as const;

describe("PluginNameNormalizer", () => {
  test("normalize strips a version suffix", () => {
    expect(PluginNameNormalizer.normalize("opencode-auto-qcgates@1.3.1")).toBe(PACKAGE_NAME);
  });

  test("normalize strips the @latest tag", () => {
    expect(PluginNameNormalizer.normalize("opencode-auto-qcgates@latest")).toBe(PACKAGE_NAME);
  });

  test("normalize lowercases and trims", () => {
    expect(PluginNameNormalizer.normalize("  OpenCode-Auto-QCGates ")).toBe(PACKAGE_NAME);
  });

  test("normalize keeps scoped package names intact", () => {
    expect(PluginNameNormalizer.normalize("@expert-vision/opencode-auto-qcgates@2.0.0")).toBe(
      "@expert-vision/opencode-auto-qcgates"
    );
  });

  test("canonicalize emits the name@latest form", () => {
    expect(PluginNameNormalizer.canonicalize(PACKAGE_NAME)).toBe(CANONICAL_PLUGIN_REF);
    expect(PluginNameNormalizer.canonicalize(`${PACKAGE_NAME}@1.0.0`)).toBe(CANONICAL_PLUGIN_REF);
  });

  test("matches treats bare, @latest, and pinned references as the same package", () => {
    expect(PluginNameNormalizer.matches(PACKAGE_NAME, PACKAGE_NAME)).toBe(true);
    expect(PluginNameNormalizer.matches(CANONICAL_PLUGIN_REF, PACKAGE_NAME)).toBe(true);
    expect(PluginNameNormalizer.matches(`${PACKAGE_NAME}@0.9.0`, PACKAGE_NAME)).toBe(true);
    expect(PluginNameNormalizer.matches("some-other-plugin", PACKAGE_NAME)).toBe(false);
  });
});

describe("config writes over unparseable JSON", () => {
  test("install refuses to rewrite an invalid local opencode.json and preserves it byte-for-byte", async () => {
    const fixtureDir = await makeFixture("invalid-local-config");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const invalidContent =
      '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugin": [\n    "opencode-architect"\n  ],\n}';
    await writeFile(join(localDir, "opencode.json"), invalidContent);

    let pluginAdded = true;
    const warnings = await captureWarnings(async () => {
      const result = await install("local", fixtureDir, {
        addPluginConfig: true,
        migrateRootConfig: false,
        force: false,
      });
      pluginAdded = result.pluginAdded;
    });

    expect(pluginAdded).toBe(false);
    expect(await readLocalConfigRaw(fixtureDir)).toBe(invalidContent);
    expect(warnings.join("\n")).toContain("could not be parsed");
    expect(warnings.join("\n")).toContain("left unchanged");
  });

  test("migrateRootConfig refuses to migrate when the root config is unparseable and preserves it byte-for-byte", async () => {
    const fixtureDir = await makeFixture("invalid-root-config");
    const invalidRoot = "{\n  \"model\": \"some/model\",\n}";
    await writeFile(join(fixtureDir, "opencode.json"), invalidRoot);

    let migrated = true;
    const warnings = await captureWarnings(async () => {
      migrated = await migrateRootConfig(fixtureDir, { enabled: true });
    });

    expect(migrated).toBe(false);
    expect(await readFile(join(fixtureDir, "opencode.json"), "utf-8")).toBe(invalidRoot);
    expect(await exists(join(fixtureDir, ".opencode", "opencode.json"))).toBe(false);
    expect(warnings.join("\n")).toContain("left unchanged");
  });
});

describe("canonical plugin references", () => {
  test("install writes the plugin reference canonically as name@latest", async () => {
    const fixtureDir = await makeFixture("canonical-fresh");
    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(true);
    const plugins = await readPluginArray(fixtureDir);
    expect(plugins).toEqual([CANONICAL_PLUGIN_REF]);
  });

  test("install does not append a duplicate when a bare name is already present", async () => {
    const fixtureDir = await makeFixture("dedup-bare-name");
    await writeLocalConfig(fixtureDir, {
      $schema: "https://opencode.ai/config.json",
      plugin: [PACKAGE_NAME],
    });

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(false);
    expect(await readPluginArray(fixtureDir)).toEqual([PACKAGE_NAME]);
  });

  test("install does not append a duplicate when a pinned version is already present", async () => {
    const fixtureDir = await makeFixture("dedup-pinned");
    await writeLocalConfig(fixtureDir, {
      $schema: "https://opencode.ai/config.json",
      plugin: [`${PACKAGE_NAME}@1.2.0`],
    });

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(false);
    expect(await readPluginArray(fixtureDir)).toEqual([`${PACKAGE_NAME}@1.2.0`]);
  });

  test("uninstall removes the plugin across all reference spellings", async () => {
    const fixtureDir = await makeFixture("uninstall-semantic");
    await writeLocalConfig(fixtureDir, {
      $schema: "https://opencode.ai/config.json",
      plugin: [PACKAGE_NAME, CANONICAL_PLUGIN_REF],
    });

    const result = await uninstall("local", fixtureDir);

    expect(result.pluginRemoved).toBe(true);
    expect(await readPluginArray(fixtureDir)).toEqual([]);
  });
});

describe("install manifest", () => {
  test("first install writes a manifest at the local config-dir root with per-file sha256 entries", async () => {
    const fixtureDir = await makeFixture("manifest-first");
    const result = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(result.action).toBe("installed");
    expect(result.manifestPath).toBe(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`));

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as {
      version: string;
      files: Array<{ path: string; hash: string }>;
    };
    expect(manifest.version.length).toBeGreaterThanOrEqual(1);
    expect(manifest.files.length).toBeGreaterThanOrEqual(1);
    for (const entry of manifest.files) {
      expect(entry.path).toMatch(/^(skills|commands|agents)\//);
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("first install removes legacy .version markers", async () => {
    const fixtureDir = await makeFixture("manifest-legacy-markers");
    const legacySkillDir = join(fixtureDir, ".opencode", "skills", "test-baselining");
    await mkdir(legacySkillDir, { recursive: true });
    await writeFile(join(legacySkillDir, ".version"), "1.1.0");

    const result = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(result.action).toBe("installed");
    expect(await exists(join(legacySkillDir, ".version"))).toBe(false);
  });

  test("reinstall at the same version with unchanged files is a no-op that writes nothing", async () => {
    const fixtureDir = await makeFixture("manifest-noop");
    await install("local", fixtureDir, INSTALL_OPTIONS);
    const before = await snapshotDirectory(fixtureDir);

    const result = await install("local", fixtureDir, INSTALL_OPTIONS);
    const after = await snapshotDirectory(fixtureDir);

    expect(result.action).toBe("noop");
    expect(result.skipped).toEqual([]);
    expect(after).toEqual(before);
  });

  test("consumer-modified files are skipped and preserved unless forced", async () => {
    const fixtureDir = await makeFixture("manifest-drift");
    await install("local", fixtureDir, INSTALL_OPTIONS);
    const skillFile = join(fixtureDir, ".opencode", "skills", "test-baselining", "SKILL.md");
    await writeFile(skillFile, "# consumer modified this file");

    const driftResult = await install("local", fixtureDir, INSTALL_OPTIONS);
    expect(driftResult.action).toBe("noop");
    expect(driftResult.skipped).toEqual(["skills/test-baselining/SKILL.md"]);
    expect(await readFile(skillFile, "utf-8")).toBe("# consumer modified this file");

    const forcedResult = await install("local", fixtureDir, {
      addPluginConfig: false,
      migrateRootConfig: false,
      force: true,
    });
    expect(forcedResult.action).toBe("upgraded");
    expect(forcedResult.skipped).toEqual([]);
    const restored = await readFile(skillFile, "utf-8");
    expect(restored.startsWith("---")).toBe(true);
  });

  test("a manifest whose recorded version differs from the package upgrades the install", async () => {
    const fixtureDir = await makeFixture("manifest-version-drift");
    await install("local", fixtureDir, INSTALL_OPTIONS);
    const manifestPath = join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
    manifest.version = "0.0.1";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(result.action).toBe("upgraded");
    const rewritten = JSON.parse(await readFile(manifestPath, "utf-8")) as { version: string };
    expect(rewritten.version).not.toBe("0.0.1");
  });

  test("global scope places the manifest at the root of the effective global config dir", async () => {
    await withGlobalSandbox(async () => {
      const fixtureDir = await makeFixture("manifest-global");
      await resetGlobalConfig();
      const result = await install("global", fixtureDir, INSTALL_OPTIONS);
      expect(result.action).toBe("installed");
      expect(result.manifestPath).toBe(join(SANDBOX_GLOBAL_BASE, `${PACKAGE_NAME}.manifest.json`));
      expect(await exists(result.manifestPath)).toBe(true);
    });
  });
});

describe("root config migration guard", () => {
  test("install without the migration option leaves a root opencode.json untouched", async () => {
    const fixtureDir = await makeFixture("migration-disabled");
    await writeFile(
      join(fixtureDir, "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", model: "some/model" }, null, 2)
    );

    const result = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(result.migrated).toBe(false);
    expect(await exists(join(fixtureDir, "opencode.json"))).toBe(true);
  });

  test("install with the migration option moves the root config into .opencode", async () => {
    const fixtureDir = await makeFixture("migration-enabled");
    await writeFile(
      join(fixtureDir, "opencode.json"),
      JSON.stringify({ $schema: "https://opencode.ai/config.json", model: "some/model" }, null, 2)
    );

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: true,
      force: false,
    });

    expect(result.migrated).toBe(true);
    expect(await exists(join(fixtureDir, "opencode.json"))).toBe(false);
    const migrated = JSON.parse(await readLocalConfigRaw(fixtureDir)) as Record<string, unknown>;
    expect(migrated["model"]).toBe("some/model");
    expect(migrated["plugin"]).toEqual([CANONICAL_PLUGIN_REF]);
  });
});

describe("cache-rot error text", () => {
  test("BundledAssetsMissingError names the path, package, version, cache dir, and remedies", () => {
    const error = new BundledAssetsMissingError(
      "/cache/node_modules/opencode-auto-qcgates/skills",
      "opencode-auto-qcgates",
      "1.5.0",
      "/home/user/.cache/opencode/packages"
    );
    expect(error.message).toContain("/cache/node_modules/opencode-auto-qcgates/skills");
    expect(error.message).toContain("opencode-auto-qcgates");
    expect(error.message).toContain("1.5.0");
    expect(error.message).toContain(
      "/home/user/.cache/opencode/packages/opencode-auto-qcgates@1.5.0"
    );
    expect(error.message).toContain("bunx opencode-auto-qcgates clear-cache");
    expect(error.message).toContain("bunx opencode-auto-qcgates install --scope global");
  });
});

describe("loud bundled-asset absence", () => {
  test("throws when a bundled asset directory is missing", async () => {
    const packageDir = join(TEST_DIR, "package-without-assets");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });

    await expect(
      resolvePackageDir(PACKAGE_NAME, "1.6.0", "/cache/packages", packageDir)
    ).rejects.toBeInstanceOf(BundledAssetsMissingError);
  });

  test("throws when a bundled asset directory exists but is empty", async () => {
    const packageDir = join(TEST_DIR, "package-with-empty-assets");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(join(packageDir, "skills"), { recursive: true });
    await mkdir(join(packageDir, "commands"), { recursive: true });

    const error = (await resolvePackageDir(
      PACKAGE_NAME,
      "1.6.0",
      "/cache/packages",
      packageDir
    ).catch((caught: unknown) => caught)) as BundledAssetsMissingError;

    expect(error).toBeInstanceOf(BundledAssetsMissingError);
    expect(error.message).toContain(join(packageDir, "skills"));
    expect(error.message).toContain("/cache/packages/opencode-auto-qcgates@1.6.0");
  });

  test("returns the package dir when both payload directories hold files at the package root", async () => {
    const packageDir = join(TEST_DIR, "package-with-assets");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(join(packageDir, "skills", "a"), { recursive: true });
    await writeFile(join(packageDir, "skills", "a", "SKILL.md"), "x");
    await mkdir(join(packageDir, "commands"), { recursive: true });
    await writeFile(join(packageDir, "commands", "c.md"), "x");

    expect(
      await resolvePackageDir(PACKAGE_NAME, "1.6.0", "/cache/packages", packageDir)
    ).toBe(packageDir);
  });

  test("install copies root skills/ and commands/ from the resolved package dir", async () => {
    const fixtureDir = await makeFixture("install-root-layout");
    const packageDir = join(TEST_DIR, "root-layout-package");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(join(packageDir, "skills", "demo"), { recursive: true });
    await writeFile(join(packageDir, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
    await mkdir(join(packageDir, "commands"), { recursive: true });
    await writeFile(join(packageDir, "commands", "demo.md"), "demo\n");

    const result = await install("local", fixtureDir, INSTALL_OPTIONS, null, false, packageDir);

    expect(result.action).toBe("installed");
    expect(await exists(join(fixtureDir, ".opencode", "skills", "demo", "SKILL.md"))).toBe(true);
    expect(await exists(join(fixtureDir, ".opencode", "commands", "demo.md"))).toBe(true);
    expect(await exists(join(fixtureDir, ".opencode", "assets"))).toBe(false);
  });

  test("install rejects with BundledAssetsMissingError when the resolved package dir lacks assets", async () => {
    const fixtureDir = await makeFixture("install-missing-assets");
    const packageDir = join(TEST_DIR, "install-package-without-assets");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });

    const error = (await install(
      "local",
      fixtureDir,
      INSTALL_OPTIONS,
      null,
      false,
      packageDir
    ).catch((caught: unknown) => caught)) as BundledAssetsMissingError;

    expect(error).toBeInstanceOf(BundledAssetsMissingError);
    expect(error.message).toContain(join(packageDir, "skills"));
    expect(error.message).toContain(PACKAGE_NAME);
    expect(await exists(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`))).toBe(false);
  });

  test("install names the content source dirs when they hold no recognized files", async () => {
    const fixtureDir = await makeFixture("install-unrecognized-content");
    const packageDir = join(TEST_DIR, "package-with-unrecognized-content");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(join(packageDir, "skills", "keep"), { recursive: true });
    await mkdir(join(packageDir, "commands"), { recursive: true });
    await writeFile(join(packageDir, "commands", "notes.txt"), "x");

    const error = (await install(
      "local",
      fixtureDir,
      INSTALL_OPTIONS,
      null,
      false,
      packageDir
    ).catch((caught: unknown) => caught)) as BundledAssetsMissingError;

    expect(error).toBeInstanceOf(BundledAssetsMissingError);
    expect(error.message).toContain(join(packageDir, "skills"));
    expect(error.message).toContain(join(packageDir, "commands"));
    expect(error.message).not.toContain(`missing or empty: ${packageDir}.`);
    expect(await exists(join(fixtureDir, ".opencode", `${PACKAGE_NAME}.manifest.json`))).toBe(false);
  });
});

describe("content declaration and mode resolution", () => {
  test("package.json declares content: code", async () => {
    expect(await getContentDeclaration()).toBe("code");
  });

  test("a missing or invalid content declaration is rejected, not defaulted", async () => {
    const packageDir = join(TEST_DIR, "package-invalid-content");
    await rm(packageDir, { recursive: true, force: true });
    await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));

    await expect(getContentDeclaration(packageDir)).rejects.toThrow(/content/);
  });

  test("resolveMode forces plugin for a code-backed package", async () => {
    expect(await resolveMode(null)).toBe("plugin");
    expect(await resolveMode("plugin")).toBe("plugin");
  });

  test("resolveMode rejects copy for a code-backed package", async () => {
    await expect(resolveMode("copy")).rejects.toBeInstanceOf(CopyModeUnsupportedError);
  });

  test("install persists mode, entry, and configPath in the manifest and reports them", async () => {
    const fixtureDir = await makeFixture("mode-manifest");
    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.mode).toBe("plugin");
    expect(result.entry).toBe(CANONICAL_PLUGIN_REF);
    expect(result.configPath).toBe(join(fixtureDir, ".opencode", "opencode.json"));

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as {
      mode: string;
      entry: string | null;
      configPath: string | null;
    };
    expect(manifest.mode).toBe("plugin");
    expect(manifest.entry).toBe(CANONICAL_PLUGIN_REF);
    expect(manifest.configPath).toBe(join(fixtureDir, ".opencode", "opencode.json"));
  });

  test("install with --mode copy throws CopyModeUnsupportedError", async () => {
    const fixtureDir = await makeFixture("mode-copy-rejected");
    await expect(install("local", fixtureDir, INSTALL_OPTIONS, "copy")).rejects.toBeInstanceOf(
      CopyModeUnsupportedError
    );
  });

  test("status reports mode and entry for an installed scope", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("status-mode");
      await install("local", fixtureDir, {
        addPluginConfig: true,
        migrateRootConfig: false,
        force: false,
      });

      const result = await status(fixtureDir);

      expect(result.local?.installed).toBe(true);
      expect(result.local?.mode).toBe("plugin");
      expect(result.local?.entry).toBe(CANONICAL_PLUGIN_REF);
      expect(result.local?.configPath).toBe(join(fixtureDir, ".opencode", "opencode.json"));
    });
  });

  test("a zero-file manifest is never reported as installed", async () => {
    const fixtureDir = await makeFixture("zero-file-manifest");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    await writeFile(
      join(localDir, `${PACKAGE_NAME}.manifest.json`),
      JSON.stringify({
        version: "9.9.9",
        mode: "plugin",
        entry: null,
        configPath: null,
        files: [],
      })
    );

    expect(await isScopeInstalled(localDir, PACKAGE_NAME)).toBe(false);
    expect((await status(fixtureDir)).local).toBeNull();
  });

  test("a consumer-edited installed file still reports the scope installed", async () => {
    const fixtureDir = await makeFixture("consumer-edited-status");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(join(localDir, "skills", "demo"), { recursive: true });
    await writeFile(join(localDir, "skills", "demo", "SKILL.md"), "consumer edited this");
    await writeFile(
      join(localDir, `${PACKAGE_NAME}.manifest.json`),
      JSON.stringify({
        version: "1.0.0",
        mode: "copy",
        entry: null,
        configPath: null,
        files: [{ path: "skills/demo/SKILL.md", hash: "0000000000000000000000000000000000000000000000000000000000000000" }],
      })
    );

    expect(await isScopeInstalled(localDir, PACKAGE_NAME)).toBe(true);
  });

  test("a recorded file missing from disk is never reported as installed", async () => {
    const fixtureDir = await makeFixture("missing-payload-status");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    await writeFile(
      join(localDir, `${PACKAGE_NAME}.manifest.json`),
      JSON.stringify({
        version: "1.0.0",
        mode: "copy",
        entry: null,
        configPath: null,
        files: [{ path: "skills/demo/SKILL.md", hash: "0000000000000000000000000000000000000000000000000000000000000000" }],
      })
    );

    expect(await isScopeInstalled(localDir, PACKAGE_NAME)).toBe(false);
  });
});

describe("surgical plugin-array registration", () => {
  test("registration is a no-op when a matching entry lives in a later candidate config", async () => {
    const fixtureDir = await makeFixture("reg-later-candidate");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const jsonPath = join(localDir, "opencode.json");
    const jsoncPath = join(localDir, "opencode.jsonc");
    const jsonContent = JSON.stringify({ $schema: "https://opencode.ai/config.json" }, null, 2) + "\n";
    const jsoncContent = `{\n  "plugin": ["${CANONICAL_PLUGIN_REF}"]\n}\n`;
    await writeFile(jsonPath, jsonContent);
    await writeFile(jsoncPath, jsoncContent);

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(false);
    expect(await readFile(jsonPath, "utf-8")).toBe(jsonContent);
    expect(await readFile(jsoncPath, "utf-8")).toBe(jsoncContent);
  });

  test("repo-root opencode.json is never written; registration creates the .opencode config", async () => {
    const fixtureDir = await makeFixture("reg-root-sacred");
    const rootPath = join(fixtureDir, "opencode.json");
    const rootContent =
      JSON.stringify({ $schema: "https://opencode.ai/config.json", model: "some/model" }, null, 2) + "\n";
    await writeFile(rootPath, rootContent);

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(true);
    expect(result.configPath).toBe(join(fixtureDir, ".opencode", "opencode.json"));
    expect(await readFile(rootPath, "utf-8")).toBe(rootContent);
    expect(await readFile(join(fixtureDir, ".opencode", "opencode.json"), "utf-8")).toContain(CANONICAL_PLUGIN_REF);
  });

  test("splice preserves comments, key order, and unrelated keys byte-for-byte", async () => {
    const fixtureDir = await makeFixture("splice-comments");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const content = [
      "{",
      "  // keep this comment",
      '  "$schema": "https://opencode.ai/config.json",',
      '  "model": "some/model",',
      '  "plugin": [',
      '    "opencode-architect"',
      "  ]",
      "}",
    ].join("\n");
    await writeFile(join(localDir, "opencode.jsonc"), content);

    await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    const after = await readFile(join(localDir, "opencode.jsonc"), "utf-8");
    expect(after).toContain("// keep this comment");
    expect(after).toContain('"model": "some/model"');
    expect(after).toContain('"opencode-architect"');
    expect(after).toContain(CANONICAL_PLUGIN_REF);
  });

  test("a semantically matching plugin entry is a zero-write no-op", async () => {
    const fixtureDir = await makeFixture("splice-noop");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const content = `{\n  "plugin": ["${PACKAGE_NAME}@1.2.0"]\n}\n`;
    await writeFile(join(localDir, "opencode.json"), content);

    await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });
    const before = await snapshotDirectory(fixtureDir);

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(false);
    expect(await readFile(join(localDir, "opencode.json"), "utf-8")).toBe(content);
    expect(await snapshotDirectory(fixtureDir)).toEqual(before);
  });
  test("a removed registration makes status report not installed and a later install re-adds it", async () => {
    const fixtureDir = await makeFixture("entry-removed");
    await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });
    const configPath = join(fixtureDir, ".opencode", "opencode.json");
    await writeFile(
      configPath,
      JSON.stringify({ $schema: "https://opencode.ai/config.json" }, null, 2)
    );

    expect((await status(fixtureDir)).local).toBeNull();

    const result = await install("local", fixtureDir, {
      addPluginConfig: true,
      migrateRootConfig: false,
      force: false,
    });

    expect(result.pluginAdded).toBe(true);
    expect((await status(fixtureDir)).local?.installed).toBe(true);
  });
});

describe("legacy manifest backward compatibility", () => {
  test("a manifest without mode reads back as copy with null entry and configPath", async () => {
    const fixtureDir = await makeFixture("legacy-manifest-mode");
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const manifestPath = join(localDir, `${PACKAGE_NAME}.manifest.json`);
    await writeFile(
      manifestPath,
      JSON.stringify({ version: "1.0.0", files: [{ path: "skills/x/SKILL.md", hash: "a".repeat(64) }] })
    );

    const manifest = await InstallManifest.read(manifestPath);

    expect(manifest.hasContents()).toBe(true);
    expect(manifest.mode).toBe("copy");
    expect(manifest.entry).toBeNull();
    expect(manifest.configPath).toBeNull();
  });
});

describe("CacheCleaner self-scoped pruning", () => {
  const CACHE_ROOT = join(SANDBOX_CACHE, "opencode", "packages");

  async function seedCache(): Promise<void> {
    process.env.XDG_CACHE_HOME = SANDBOX_CACHE;
    await rm(CACHE_ROOT, { recursive: true, force: true });
    for (const name of [
      "opencode-auto-qcgates",
      "opencode-auto-qcgates@latest",
      "opencode-auto-qcgates@1.6.0",
      "opencode-auto-qcgates@1.2.0",
      "other-package@latest",
    ]) {
      await mkdir(join(CACHE_ROOT, name), { recursive: true });
    }
  }

  test("prunePackageCache removes only this package's own copies, never pinned other versions or other packages", async () => {
    await seedCache();
    const cleaner = new CacheCleaner();

    const outcome = await cleaner.prunePackageCache("opencode-auto-qcgates", "1.6.0");

    expect(outcome.warnings).toEqual([]);
    expect(outcome.removed.sort()).toEqual(
      [
        join(CACHE_ROOT, "opencode-auto-qcgates"),
        join(CACHE_ROOT, "opencode-auto-qcgates@latest"),
        join(CACHE_ROOT, "opencode-auto-qcgates@1.6.0"),
      ].sort()
    );
    expect(await exists(join(CACHE_ROOT, "opencode-auto-qcgates@1.2.0"))).toBe(true);
    expect(await exists(join(CACHE_ROOT, "other-package@latest"))).toBe(true);
  });

  test("clearPackageCache removes <package> and every <package>@* idempotently", async () => {
    await seedCache();
    const cleaner = new CacheCleaner();

    const first = await cleaner.clearPackageCache("opencode-auto-qcgates");
    expect(first.removed.length).toBe(4);
    expect(await exists(join(CACHE_ROOT, "opencode-auto-qcgates@1.2.0"))).toBe(false);
    expect(await exists(join(CACHE_ROOT, "other-package@latest"))).toBe(true);

    const second = await cleaner.clearPackageCache("opencode-auto-qcgates");
    expect(second.removed).toEqual([]);
    expect(second.warnings).toEqual([]);
  });

  test("nothing cached is a success", async () => {
    process.env.XDG_CACHE_HOME = SANDBOX_CACHE;
    await rm(CACHE_ROOT, { recursive: true, force: true });
    const cleaner = new CacheCleaner();
    const outcome = await cleaner.clearPackageCache("opencode-auto-qcgates");
    expect(outcome.removed).toEqual([]);
    expect(outcome.warnings).toEqual([]);
  });
});
