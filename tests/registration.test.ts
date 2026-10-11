import { describe, test, expect, spyOn } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, readFile, symlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { RegistrationDetector, type RegistrationContext } from "../src/registration.ts";
import { install } from "../src/installer.ts";
import { snapshotDirectory } from "./snapshot.ts";
import { SANDBOX_GLOBAL_BASE, resetGlobalConfig, withGlobalSandbox, writeGlobalPluginConfig } from "./global-sandbox.ts";

const TEST_DIR = join(import.meta.dirname, ".test-registration");
process.env.XDG_CACHE_HOME = join(import.meta.dirname, ".test-xdg-cache");
const PACKAGE_NAME = "opencode-auto-qcgates";

async function makeFixture(name: string): Promise<string> {
  const fixtureDir = join(TEST_DIR, name);
  await rm(fixtureDir, { recursive: true, force: true });
  await mkdir(fixtureDir, { recursive: true });
  return fixtureDir;
}

async function writeNestedRepoConfig(fixtureDir: string, plugins: string[]): Promise<void> {
  const localDir = join(fixtureDir, ".opencode");
  await mkdir(localDir, { recursive: true });
  await writeFile(
    join(localDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins }, null, 2)
  );
}

async function writeRootRepoConfig(fixtureDir: string, plugins: string[]): Promise<void> {
  await writeFile(
    join(fixtureDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins }, null, 2)
  );
}

async function expectContext(fixtureDir: string, expected: RegistrationContext): Promise<void> {
  expect(await RegistrationDetector.detect(fixtureDir)).toBe(expected);
}

describe("RegistrationDetector.detect", () => {
  test("returns none when nothing registers the package anywhere", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("none");
      await expectContext(fixtureDir, "none");
    });
  });

  test("returns global for a bare-name global registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("global-bare");
      await expectContext(fixtureDir, "global");
    });
  });

  test("returns global for a name@latest global registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([`${PACKAGE_NAME}@latest`]);
      const fixtureDir = await makeFixture("global-latest");
      await expectContext(fixtureDir, "global");
    });
  });

  test("returns global for a pinned name@x.y.z global registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([`${PACKAGE_NAME}@1.4.0`]);
      const fixtureDir = await makeFixture("global-pinned");
      await expectContext(fixtureDir, "global");
    });
  });

  test("returns repo-local for a nested .opencode/opencode.json registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-nested");
      await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
      await expectContext(fixtureDir, "repo-local");
    });
  });

  test("returns repo-local for a repo-root opencode.json registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-root");
      await writeRootRepoConfig(fixtureDir, [`${PACKAGE_NAME}@latest`]);
      await expectContext(fixtureDir, "repo-local");
    });
  });

  test("returns repo-local when a foreign plugin occupies the global registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig(["opencode-architect"]);
      const fixtureDir = await makeFixture("repo-with-foreign-global");
      await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
      await expectContext(fixtureDir, "repo-local");
    });
  });

  test("returns both when both scopes register the package", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("both");
      await writeRootRepoConfig(fixtureDir, [PACKAGE_NAME]);
      await expectContext(fixtureDir, "both");
    });
  });

  test("returns global for a global opencode.jsonc registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      await writeFile(
        join(SANDBOX_GLOBAL_BASE, "opencode.jsonc"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      const fixtureDir = await makeFixture("global-jsonc");
      await expectContext(fixtureDir, "global");
    });
  });

  test("returns repo-local for a repo-root opencode.jsonc registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-root-jsonc");
      await writeFile(
        join(fixtureDir, "opencode.jsonc"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      await expectContext(fixtureDir, "repo-local");
    });
  });

  test("returns repo-local for a nested .opencode/opencode.jsonc registration", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("repo-nested-jsonc");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(
        join(localDir, "opencode.jsonc"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      await expectContext(fixtureDir, "repo-local");
    });
  });

  test("returns both when global jsonc and nested json register the package", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      await writeFile(
        join(SANDBOX_GLOBAL_BASE, "opencode.jsonc"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );
      const fixtureDir = await makeFixture("both-jsonc-global");
      await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
      await expectContext(fixtureDir, "both");
    });
  });

  test("detection performs zero disk writes", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await writeGlobalPluginConfig([PACKAGE_NAME]);
      const fixtureDir = await makeFixture("zero-write");
      await writeNestedRepoConfig(fixtureDir, [PACKAGE_NAME]);
      const before = await snapshotDirectory(fixtureDir);
      const beforeGlobal = await snapshotDirectory(SANDBOX_GLOBAL_BASE);

      await RegistrationDetector.detect(fixtureDir);

      expect(await snapshotDirectory(fixtureDir)).toEqual(before);
      expect(await snapshotDirectory(SANDBOX_GLOBAL_BASE)).toEqual(beforeGlobal);
    });
  });

  test("detects a jsonc registration whose line comment sits between the trailing comma and the array closer", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const content = `{\n  "plugins": [\n    "${PACKAGE_NAME}", // trailing comment\n  ]\n}`;
      const fixtureDir = await makeFixture("jsonc-array-line-comment");
      const jsoncPath = join(fixtureDir, "opencode.jsonc");
      await writeFile(jsoncPath, content);

      await expectJsoncRegistration(fixtureDir, jsoncPath, content);
    });
  });

  test("detects a jsonc registration whose block comment sits between the trailing comma and the array closer", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const content = `{\n  "plugins": [\n    "${PACKAGE_NAME}", /* trailing comment */\n  ]\n}`;
      const fixtureDir = await makeFixture("jsonc-array-block-comment");
      const jsoncPath = join(fixtureDir, "opencode.jsonc");
      await writeFile(jsoncPath, content);

      await expectJsoncRegistration(fixtureDir, jsoncPath, content);
    });
  });

  test("detects a jsonc registration whose comment sits between the trailing comma and the object closer", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const contents = [
        `{\n  "plugins": ["${PACKAGE_NAME}"], // trailing comment\n}`,
        `{\n  "plugins": ["${PACKAGE_NAME}"], /* trailing comment */\n}`,
      ];

      for (const [index, content] of contents.entries()) {
        const fixtureDir = await makeFixture(`jsonc-object-comment-${index}`);
        const jsoncPath = join(fixtureDir, "opencode.jsonc");
        await writeFile(jsoncPath, content);

        await expectJsoncRegistration(fixtureDir, jsoncPath, content);
      }
    });
  });

  test("keeps a comma or line comment inside a string out of the trailing-comma scanner", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const content =
        `{\n  "plugins": ["${PACKAGE_NAME}"],\n` +
        `  "note": "escaped quote \\" then // slashes, and a } brace"\n}`;
      const fixtureDir = await makeFixture("jsonc-string-awareness");
      const jsoncPath = join(fixtureDir, "opencode.jsonc");
      await writeFile(jsoncPath, content);

      await expectJsoncRegistration(fixtureDir, jsoncPath, content);
    });
  });
});

async function expectJsoncRegistration(fixtureDir: string, jsoncPath: string, content: string): Promise<void> {
  const before = await snapshotDirectory(fixtureDir);
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await RegistrationDetector.detect(fixtureDir)).toBe("repo-local");
    expect(warn).not.toHaveBeenCalled();
    expect(await snapshotDirectory(fixtureDir)).toEqual(before);
    expect(await readFile(jsoncPath, "utf-8")).toBe(content);
  } finally {
    warn.mockRestore();
  }
}

describe("legacy singular plugin key detection", () => {
  test("a legacy-only singular plugin entry does not count as registered", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("legacy-nested-unregistered");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      await writeFile(join(localDir, "opencode.json"), `{\n  "plugin": ["${PACKAGE_NAME}"]\n}\n`);

      const warnings: string[] = [];
      const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      try {
        await expectContext(fixtureDir, "none");
      } finally {
        warn.mockRestore();
      }
      expect(warnings.join("\n")).toContain("legacy and inert under OpenCode v2");
    });
  });

  test("a legacy-only global registration leaves detection at none", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      await mkdir(SANDBOX_GLOBAL_BASE, { recursive: true });
      await writeFile(join(SANDBOX_GLOBAL_BASE, "opencode.json"), `{\n  "plugin": ["${PACKAGE_NAME}"]\n}\n`);
      const fixtureDir = await makeFixture("legacy-global-unregistered");
      const warn = spyOn(console, "warn").mockImplementation(() => {});
      try {
        await expectContext(fixtureDir, "none");
      } finally {
        warn.mockRestore();
      }
    });
  });

  test("a legacy-only config triggers the upgrade advisory once across repeated detection", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("legacy-detect-advisory-once");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const legacyPath = join(localDir, "opencode.json");
      await writeFile(legacyPath, `{\n  "plugin": ["${PACKAGE_NAME}"]\n}\n`);

      const warnings: string[] = [];
      const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      try {
        await expectContext(fixtureDir, "none");
        await expectContext(fixtureDir, "none");
      } finally {
        warn.mockRestore();
      }
      const advisories = warnings.filter(w => w.includes("legacy and inert under OpenCode v2"));
      expect(advisories.length).toBe(1);
      expect(advisories[0]).toContain(legacyPath);
      expect(await readFile(legacyPath, "utf-8")).toBe(`{\n  "plugin": ["${PACKAGE_NAME}"]\n}\n`);
    });
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
  const INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false } as const;

  test("returns false when nothing is installed in any scope", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("install-none");
      expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(false);
    });
  });

  test("returns false for a bare skill directory without a manifest", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const skillDir = join(SANDBOX_GLOBAL_BASE, "skills", "test-baselining");
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, "SKILL.md"), "---\nname: test-baselining\n---\n");
      const fixtureDir = await makeFixture("install-bare-dir");
      expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(false);
    });
  });

  test("returns false for a bare .version marker without a manifest", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("install-bare-version");
      const legacySkillDir = join(fixtureDir, ".opencode", "skills", "test-baselining");
      await mkdir(legacySkillDir, { recursive: true });
      await writeFile(join(legacySkillDir, ".version"), "1.1.0");
      expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(false);
    });
  });

  test("returns true when the global scope holds a manifest-backed install", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("install-global");
      await install("global", fixtureDir, INSTALL_OPTIONS);
      expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(true);
    });
  });

  test("returns true when only the repo scope holds a manifest-backed install", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("install-repo");
      await install("local", fixtureDir, INSTALL_OPTIONS);
      expect(await RegistrationDetector.hasAnyInstallation(fixtureDir)).toBe(true);
    });
  });
});

describe("RegistrationDetector read-only hardening", () => {
  test("warns for an unparseable candidate while still matching another candidate", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("unparseable-plus-match");
      const localDir = join(fixtureDir, ".opencode");
      await mkdir(localDir, { recursive: true });
      const invalidContent =
        '{\n  "$schema": "https://opencode.ai/config.json",\n  "plugins": [\n    "opencode-architect"\n  ],\n}';
      const invalidPath = join(localDir, "opencode.json");
      await writeFile(invalidPath, invalidContent);
      await writeFile(
        join(fixtureDir, "opencode.json"),
        JSON.stringify({ $schema: "https://opencode.ai/config.json", plugins: [PACKAGE_NAME] }, null, 2)
      );

      const warnings: string[] = [];
      const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      try {
        expect(await RegistrationDetector.detect(fixtureDir)).toBe("repo-local");
        expect(warnings.join("\n")).toContain(invalidPath);
        expect(await readFile(invalidPath, "utf-8")).toBe(invalidContent);
      } finally {
        warn.mockRestore();
      }
    });
  });
});

describe("path-form entry detection (B2/C1)", () => {
  const LEGACY_ADVISORY_MARKER = "legacy and inert under OpenCode v2";

  async function makeScratchPackage(name: string, pkgName: string): Promise<string> {
    const scratchDir = join(TEST_DIR, name);
    await rm(scratchDir, { recursive: true, force: true });
    await mkdir(scratchDir, { recursive: true });
    await writeFile(join(scratchDir, "package.json"), JSON.stringify({ name: pkgName, version: "1.0.0" }));
    await writeFile(join(scratchDir, "index.ts"), "export default {};\n");
    return scratchDir;
  }

  async function writeNestedRawConfig(fixtureDir: string, content: string): Promise<string> {
    const localDir = join(fixtureDir, ".opencode");
    await mkdir(localDir, { recursive: true });
    const configPath = join(localDir, "opencode.json");
    await writeFile(configPath, content);
    return configPath;
  }

  async function detectSilently(fixtureDir: string): Promise<{ context: RegistrationContext; warnings: string[] }> {
    const warnings: string[] = [];
    const warn = spyOn(console, "warn").mockImplementation((message: unknown) => {
      warnings.push(String(message));
    });
    try {
      const context = await RegistrationDetector.detect(fixtureDir);
      return { context, warnings };
    } finally {
      warn.mockRestore();
    }
  }

  test("returns repo-local for a file:// URL entry resolving to this package", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("path-url-detect");
      const scratch = await makeScratchPackage("detect-scratch-url", PACKAGE_NAME);
      const url = pathToFileURL(scratch).href;
      await writeNestedRawConfig(fixtureDir, `{\n  "plugins": ["${url}"]\n}\n`);
      const { context, warnings } = await detectSilently(fixtureDir);
      expect(context).toBe("repo-local");
      expect(warnings.join("\n")).not.toContain(LEGACY_ADVISORY_MARKER);
    });
  });

  test("returns repo-local for an object-form { package } path entry", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("path-object-detect");
      const scratch = await makeScratchPackage("detect-scratch-object", PACKAGE_NAME);
      const url = pathToFileURL(scratch).href;
      await writeNestedRawConfig(fixtureDir, `{\n  "plugins": [{ "package": "${url}" }]\n}\n`);
      const { context } = await detectSilently(fixtureDir);
      expect(context).toBe("repo-local");
    });
  });

  test("returns repo-local for a symlinked entrypoint path entry", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("path-symlink-detect");
      const scratch = await makeScratchPackage("detect-scratch-symlink", PACKAGE_NAME);
      const linkPath = join(TEST_DIR, "detect-scratch-symlink-link.ts");
      await rm(linkPath, { force: true });
      await symlink(join(scratch, "index.ts"), linkPath);
      await writeNestedRawConfig(fixtureDir, `{\n  "plugins": ["${linkPath}"]\n}\n`);
      try {
        const { context } = await detectSilently(fixtureDir);
        expect(context).toBe("repo-local");
      } finally {
        await rm(linkPath, { force: true });
      }
    });
  });

  test("returns none for an unresolvable path entry without throwing", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("path-unresolvable-detect");
      await writeNestedRawConfig(fixtureDir, `{\n  "plugins": ["/nonexistent-qcgates-missing-dir"]\n}\n`);
      const { context, warnings } = await detectSilently(fixtureDir);
      expect(context).toBe("none");
      expect(warnings.join("\n")).not.toContain(LEGACY_ADVISORY_MARKER);
    });
  });

  test("a legacy singular plugin path entry stays unregistered but triggers the advisory", async () => {
    await withGlobalSandbox(async () => {
      await resetGlobalConfig();
      const fixtureDir = await makeFixture("path-legacy-advisory");
      const scratch = await makeScratchPackage("detect-scratch-legacy", PACKAGE_NAME);
      const url = pathToFileURL(scratch).href;
      const configPath = await writeNestedRawConfig(fixtureDir, `{\n  "plugin": ["${url}"]\n}\n`);
      const { context, warnings } = await detectSilently(fixtureDir);
      expect(context).toBe("none");
      expect(warnings.join("\n")).toContain(LEGACY_ADVISORY_MARKER);
      expect(await readFile(configPath, "utf-8")).toBe(`{\n  "plugin": ["${url}"]\n}\n`);
    });
  });
});
