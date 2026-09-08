import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { install } from "../src/installer.ts";
import { InstallManifest } from "../src/manifest.ts";
import {
  validatePackageManifest,
  mergeOptionalDependencies,
  loadPackageManifest,
  type PackageManifest,
  type PackageOptionalDep,
  type InstallOptionalDep,
} from "../src/optional-deps.ts";

const VALID_MANIFEST: PackageManifest = {
  manifestVersion: 1,
  optionalDependencies: [
    {
      id: "grilling",
      kind: "skill",
      description: "Interview loop for `/test-baseline init` when tiers cannot be inferred.",
      source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
    },
  ],
};

describe("validatePackageManifest", () => {
  test("accepts a minimal valid manifest with one external-skill entry", () => {
    const result = validatePackageManifest(VALID_MANIFEST);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.manifestVersion).toBe(1);
      expect(result.manifest.optionalDependencies).toHaveLength(1);
      expect(result.manifest.optionalDependencies[0]).toEqual(VALID_MANIFEST.optionalDependencies[0]);
    }
  });

  test("accepts every supported kind", () => {
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [
        { id: "a", kind: "skill", description: "d", source: { type: "bundled", path: "assets/skills/a" } },
        { id: "b", kind: "agent", description: "d", source: { type: "bundled", path: "assets/agents/b" } },
        { id: "c", kind: "plugin", description: "d", source: { type: "npm", package: "some-plugin" } },
        { id: "d", kind: "mcp", description: "d", source: { type: "command", command: "some-mcp --serve" } },
        { id: "e", kind: "mcp", description: "d", source: { type: "url", url: "https://example.com/mcp" } },
      ],
    });
    expect(result.ok).toBe(true);
  });

  test("rejects a non-object manifest", () => {
    for (const value of [null, "string", 42, [], true]) {
      const result = validatePackageManifest(value);
      expect(result.ok).toBe(false);
    }
  });

  test("rejects an unknown manifestVersion", () => {
    const result = validatePackageManifest({ ...VALID_MANIFEST, manifestVersion: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("manifestVersion");
    }
  });

  test("rejects a missing or non-array optionalDependencies", () => {
    const missing = { manifestVersion: 1 };
    expect(validatePackageManifest(missing).ok).toBe(false);
    expect(validatePackageManifest({ ...VALID_MANIFEST, optionalDependencies: "nope" }).ok).toBe(false);
  });

  test("rejects an unknown kind", () => {
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [{ ...VALID_MANIFEST.optionalDependencies[0], kind: "workflow" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("kind");
    }
  });

  test("rejects a blank or missing description", () => {
    for (const description of [undefined, "", "   "]) {
      const result = validatePackageManifest({
        manifestVersion: 1,
        optionalDependencies: [{ ...VALID_MANIFEST.optionalDependencies[0], description }],
      });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects an entry with a blank id", () => {
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [{ ...VALID_MANIFEST.optionalDependencies[0], id: "" }],
    });
    expect(result.ok).toBe(false);
  });

  test("rejects an unknown source type", () => {
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [
        {
          id: "x",
          kind: "plugin",
          description: "d",
          source: { type: "tarball", url: "https://example.com/x.tgz" },
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("source.type");
    }
  });

  test("rejects sources missing their required payload field", () => {
    const cases = [
      { id: "a", kind: "skill", description: "d", source: { type: "bundled" } },
      { id: "b", kind: "skill", description: "d", source: { type: "external-skill", repo: "o/r" } },
      { id: "c", kind: "skill", description: "d", source: { type: "external-skill", skill: "s" } },
      { id: "d", kind: "plugin", description: "d", source: { type: "npm" } },
      { id: "e", kind: "mcp", description: "d", source: { type: "command" } },
      { id: "f", kind: "mcp", description: "d", source: { type: "url" } },
    ];
    for (const entry of cases) {
      const result = validatePackageManifest({
        manifestVersion: 1,
        optionalDependencies: [entry],
      });
      expect(result.ok).toBe(false);
    }
  });

  test("rejects duplicate ids", () => {
    const entry = VALID_MANIFEST.optionalDependencies[0];
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [entry, { ...entry, kind: "agent" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("duplicate");
    }
  });

  test("reports every error, not just the first", () => {
    const result = validatePackageManifest({
      manifestVersion: 7,
      optionalDependencies: [{ id: "", kind: "skill", description: "", source: { type: "npm" } }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("error messages name the offending entry index", () => {
    const result = validatePackageManifest({
      manifestVersion: 1,
      optionalDependencies: [
        {
          id: "ok-entry",
          kind: "skill",
          description: "d",
          source: { type: "external-skill", repo: "o/r", skill: "s" },
        },
        { id: "bad-entry", kind: "skill", description: "d", source: { type: "command" } },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("optionalDependencies[1]");
    }
  });
});

describe("mergeOptionalDependencies", () => {
  const GRILLING: PackageOptionalDep = {
    id: "grilling",
    kind: "skill",
    description: "Interview loop for `/test-baseline init`.",
    source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
  };

  function declared(...deps: PackageOptionalDep[]): PackageOptionalDep[] {
    return deps;
  }

  function installed(...deps: InstallOptionalDep[]): InstallOptionalDep[] {
    return deps;
  }

  function withState(dep: PackageOptionalDep, state: InstallOptionalDep["state"]): InstallOptionalDep {
    return { ...dep, state };
  }

  test("a fresh install marks every declared dependency pending", () => {
    const result = mergeOptionalDependencies(undefined, declared(GRILLING));
    expect(result.dependencies).toEqual([withState(GRILLING, "pending")]);
    expect(result.changed).toBe(true);
  });

  test("an empty existing section is treated the same as a missing one", () => {
    const result = mergeOptionalDependencies([], declared(GRILLING));
    expect(result.dependencies).toEqual([withState(GRILLING, "pending")]);
    expect(result.changed).toBe(true);
  });

  test("accepted state survives a merge with an unchanged declaration", () => {
    const result = mergeOptionalDependencies(
      installed(withState(GRILLING, "accepted")),
      declared(GRILLING)
    );
    expect(result.dependencies).toEqual([withState(GRILLING, "accepted")]);
    expect(result.changed).toBe(false);
  });

  test("declined state is sticky for an unchanged declaration", () => {
    const result = mergeOptionalDependencies(
      installed(withState(GRILLING, "declined")),
      declared(GRILLING)
    );
    expect(result.dependencies).toEqual([withState(GRILLING, "declined")]);
    expect(result.changed).toBe(false);
  });

  test("a changed source flips accepted back to pending", () => {
    const moved: PackageOptionalDep = {
      ...GRILLING,
      source: { type: "external-skill", repo: "someone-else/skills", skill: "grilling" },
    };
    const result = mergeOptionalDependencies(installed(withState(GRILLING, "accepted")), declared(moved));
    expect(result.dependencies).toEqual([withState(moved, "pending")]);
    expect(result.changed).toBe(true);
  });

  test("a changed kind flips declined back to pending", () => {
    const rekindled: PackageOptionalDep = { ...GRILLING, kind: "plugin" };
    const result = mergeOptionalDependencies(installed(withState(GRILLING, "declined")), declared(rekindled));
    expect(result.dependencies).toEqual([withState(rekindled, "pending")]);
    expect(result.changed).toBe(true);
  });

  test("a description-only change refreshes the description but preserves state", () => {
    const reworded: PackageOptionalDep = { ...GRILLING, description: "A better description." };
    const result = mergeOptionalDependencies(
      installed(withState(GRILLING, "accepted")),
      declared(reworded)
    );
    expect(result.dependencies).toEqual([withState(reworded, "accepted")]);
    expect(result.changed).toBe(true);
  });

  test("entries absent from the package declaration are kept (union)", () => {
    const retired: PackageOptionalDep = {
      id: "retired-dep",
      kind: "skill",
      description: "No longer declared.",
      source: { type: "bundled", path: "assets/skills/retired-dep" },
    };
    const result = mergeOptionalDependencies(
      installed(withState(retired, "declined")),
      declared(GRILLING)
    );
    expect(result.dependencies).toEqual([
      withState(GRILLING, "pending"),
      withState(retired, "declined"),
    ]);
    expect(result.changed).toBe(true);
  });

  test("package order wins; undeclared entries follow", () => {
    const second: PackageOptionalDep = {
      id: "second",
      kind: "plugin",
      description: "A plugin dep.",
      source: { type: "npm", package: "second-plugin" },
    };
    const kept: PackageOptionalDep = {
      id: "kept",
      kind: "agent",
      description: "An agent dep.",
      source: { type: "bundled", path: "assets/agents/kept" },
    };
    const result = mergeOptionalDependencies(
      installed(withState(kept, "accepted"), withState(second, "accepted")),
      declared(GRILLING, second)
    );
    expect(result.dependencies.map(dep => dep.id)).toEqual(["grilling", "second", "kept"]);
  });

  test("merging is idempotent: re-merging the output changes nothing", () => {
    const first = mergeOptionalDependencies(undefined, declared(GRILLING));
    const second = mergeOptionalDependencies(first.dependencies, declared(GRILLING));
    expect(second.dependencies).toEqual(first.dependencies);
    expect(second.changed).toBe(false);
  });
});

describe("loadPackageManifest", () => {
  const PACKAGE_DIR = join(import.meta.dirname, "..");
  const FIXTURES = join(import.meta.dirname, ".test-optional-deps");

  beforeAll(async () => {
    await rm(FIXTURES, { recursive: true, force: true });
    await mkdir(FIXTURES, { recursive: true });
  });

  afterAll(async () => {
    await rm(FIXTURES, { recursive: true, force: true });
  });

  test("loads the shipped assets/manifest.json with grilling as the first entry", async () => {
    const result = await loadPackageManifest(PACKAGE_DIR);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.optionalDependencies.length).toBeGreaterThanOrEqual(1);
      const grilling = result.manifest.optionalDependencies[0];
      expect(grilling.id).toBe("grilling");
      expect(grilling.kind).toBe("skill");
      expect(grilling.source).toEqual({
        type: "external-skill",
        repo: "mattpocock/skills",
        skill: "grilling",
      });
      expect(grilling.description.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("a package dir without a manifest yields an empty dependency list", async () => {
    const emptyDir = join(FIXTURES, "no-manifest");
    await mkdir(emptyDir, { recursive: true });
    const result = await loadPackageManifest(emptyDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.optionalDependencies).toEqual([]);
    }
  });

  test("unparseable JSON is a validation failure, not a throw", async () => {
    const brokenDir = join(FIXTURES, "broken-json");
    await mkdir(join(brokenDir, "assets"), { recursive: true });
    await writeFile(join(brokenDir, "assets", "manifest.json"), "{ not json");
    const result = await loadPackageManifest(brokenDir);
    expect(result.ok).toBe(false);
  });

  test("a schema-invalid manifest reports its errors", async () => {
    const invalidDir = join(FIXTURES, "invalid-schema");
    await mkdir(join(invalidDir, "assets"), { recursive: true });
    await writeFile(
      join(invalidDir, "assets", "manifest.json"),
      JSON.stringify({ manifestVersion: 2, optionalDependencies: [] })
    );
    const result = await loadPackageManifest(invalidDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join("\n")).toContain("manifestVersion");
    }
  });
});

describe("install optionalDependencies integration", () => {
  const TEST_DIR = join(import.meta.dirname, ".test-install-optdeps");
  const PACKAGE_NAME = "opencode-auto-qcgates";
  const INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false } as const;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
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

  async function readSection(manifestPath: string): Promise<InstallOptionalDep[]> {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
      optionalDependencies: InstallOptionalDep[] | null;
    };
    return manifest.optionalDependencies ?? [];
  }

  async function rewriteManifest(manifestPath: string, mutate: (manifest: Record<string, unknown>) => void): Promise<void> {
    const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Record<string, unknown>;
    mutate(manifest);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  test("fresh install records the grilling declaration as pending", async () => {
    const fixtureDir = await makeFixture("fresh");
    const result = await install("local", fixtureDir, INSTALL_OPTIONS);

    const deps = await readSection(result.manifestPath);
    expect(deps).toHaveLength(1);
    expect(deps[0].id).toBe("grilling");
    expect(deps[0].kind).toBe("skill");
    expect(deps[0].state).toBe("pending");
    expect(deps[0].source).toEqual({
      type: "external-skill",
      repo: "mattpocock/skills",
      skill: "grilling",
    });
  });

  test("accepted state survives a reinstall of an unchanged package", async () => {
    const fixtureDir = await makeFixture("sticky-accepted");
    const first = await install("local", fixtureDir, INSTALL_OPTIONS);
    await rewriteManifest(first.manifestPath, manifest => {
      const deps = manifest["optionalDependencies"] as InstallOptionalDep[];
      deps[0]["state"] = "accepted";
    });

    const second = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(second.action).toBe("noop");
    const deps = await readSection(first.manifestPath);
    expect(deps[0].state).toBe("accepted");
  });

  test("a changed package declaration flips a declined state back to pending", async () => {
    const fixtureDir = await makeFixture("changed-decl");
    const first = await install("local", fixtureDir, INSTALL_OPTIONS);
    await rewriteManifest(first.manifestPath, manifest => {
      const deps = manifest["optionalDependencies"] as InstallOptionalDep[];
      deps[0]["source"] = { type: "external-skill", repo: "old-owner/skills", skill: "grilling" };
      deps[0]["state"] = "declined";
    });

    await install("local", fixtureDir, INSTALL_OPTIONS);

    const deps = await readSection(first.manifestPath);
    expect(deps[0].state).toBe("pending");
    expect(deps[0].source).toEqual({
      type: "external-skill",
      repo: "mattpocock/skills",
      skill: "grilling",
    });
  });

  test("a manifest predating the section gains it without rewriting any asset file", async () => {
    const fixtureDir = await makeFixture("legacy-manifest");
    const first = await install("local", fixtureDir, INSTALL_OPTIONS);
    await rewriteManifest(first.manifestPath, manifest => {
      delete manifest["optionalDependencies"];
    });

    const second = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(second.action).toBe("noop");
    const deps = await readSection(first.manifestPath);
    expect(deps.map(dep => dep.id)).toEqual(["grilling"]);
    expect(deps[0].state).toBe("pending");
  });
});

describe("mergeOptionalDependencies canonical equality", () => {
  test("a source object with reordered keys is not a changed declaration", () => {
    const grilling: PackageOptionalDep = {
      id: "grilling",
      kind: "skill",
      description: "Interview loop.",
      source: { type: "external-skill", repo: "mattpocock/skills", skill: "grilling" },
    };
    const reordered: PackageOptionalDep = {
      ...grilling,
      source: { skill: "grilling", repo: "mattpocock/skills", type: "external-skill" },
    };
    const first = mergeOptionalDependencies(undefined, [grilling]);
    const second = mergeOptionalDependencies(
      first.dependencies.map(dep => ({ ...dep, state: "accepted" as const })),
      [reordered]
    );
    expect(second.dependencies[0].state).toBe("accepted");
    expect(second.changed).toBe(false);
  });
});

describe("InstallManifest.read optionalDependencies handling", () => {
  const FIXTURES = join(import.meta.dirname, ".test-install-manifest-optdeps");

  beforeAll(async () => {
    await rm(FIXTURES, { recursive: true, force: true });
    await mkdir(FIXTURES, { recursive: true });
  });

  afterAll(async () => {
    await rm(FIXTURES, { recursive: true, force: true });
  });

  function validFiles(): Array<{ path: string; hash: string }> {
    return [{ path: "skills/test-baselining/SKILL.md", hash: "a".repeat(64) }];
  }

  test("a malformed dep entry degrades the section but keeps the manifest contents", async () => {
    const manifestPath = join(FIXTURES, "bad-entry.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: "1.0.0",
        files: validFiles(),
        optionalDependencies: [{ id: "grilling", state: "bogus" }],
      })
    );

    const manifest = await InstallManifest.read(manifestPath);

    expect(manifest.hasContents()).toBe(true);
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.recordedHash("skills/test-baselining/SKILL.md")).toBe("a".repeat(64));
    expect(manifest.optionalDependencies).toEqual([]);
  });

  test("a non-array dep section degrades the section but keeps the manifest contents", async () => {
    const manifestPath = join(FIXTURES, "bad-section.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ version: "1.0.0", files: validFiles(), optionalDependencies: "nope" })
    );

    const manifest = await InstallManifest.read(manifestPath);

    expect(manifest.hasContents()).toBe(true);
    expect(manifest.optionalDependencies).toEqual([]);
  });
});

describe("install survives a corrupted dep section without clobbering user files", () => {
  const TEST_DIR = join(import.meta.dirname, ".test-corrupt-optdeps");
  const INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false } as const;

  beforeAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  test("a drifted skill file stays skipped when the dep section is malformed", async () => {
    const fixtureDir = join(TEST_DIR, "drift-corrupt");
    await mkdir(fixtureDir, { recursive: true });
    const first = await install("local", fixtureDir, INSTALL_OPTIONS);

    const skillFile = join(fixtureDir, ".opencode", "skills", "test-baselining", "SKILL.md");
    await writeFile(skillFile, "# consumer modified this file");

    const manifest = JSON.parse(await readFile(first.manifestPath, "utf-8")) as Record<string, unknown>;
    manifest["optionalDependencies"] = [{ id: "grilling", state: "bogus" }];
    await writeFile(first.manifestPath, JSON.stringify(manifest, null, 2));

    const second = await install("local", fixtureDir, INSTALL_OPTIONS);

    expect(second.skipped).toEqual(["skills/test-baselining/SKILL.md"]);
    expect(await readFile(skillFile, "utf-8")).toBe("# consumer modified this file");
    const deps = (JSON.parse(await readFile(first.manifestPath, "utf-8")) as {
      optionalDependencies: Array<{ id: string; state: string }> | null;
    }).optionalDependencies ?? [];
    expect(deps.map(dep => dep.id)).toEqual(["grilling"]);
    expect(deps[0].state).toBe("pending");
  });
});
