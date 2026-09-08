import { describe, test, expect } from "bun:test";
import { validatePackageManifest, type PackageManifest } from "../src/optional-deps.ts";

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
