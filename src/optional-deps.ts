export type OptionalDepKind = "skill" | "agent" | "mcp" | "plugin";

export type OptionalDepState = "pending" | "accepted" | "declined";

export interface BundledSource {
  type: "bundled";
  path: string;
}

export interface ExternalSkillSource {
  type: "external-skill";
  repo: string;
  skill: string;
}

export interface NpmSource {
  type: "npm";
  package: string;
}

export interface CommandSource {
  type: "command";
  command: string;
}

export interface UrlSource {
  type: "url";
  url: string;
}

export type OptionalDepSource =
  | BundledSource
  | ExternalSkillSource
  | NpmSource
  | CommandSource
  | UrlSource;

export interface PackageOptionalDep {
  id: string;
  kind: OptionalDepKind;
  description: string;
  source: OptionalDepSource;
}

export interface PackageManifest {
  manifestVersion: 1;
  optionalDependencies: PackageOptionalDep[];
}

export interface InstallOptionalDep extends PackageOptionalDep {
  state: OptionalDepState;
}

export type PackageManifestValidation =
  | { ok: true; manifest: PackageManifest }
  | { ok: false; errors: string[] };

export const EMPTY_PACKAGE_MANIFEST: PackageManifest = {
  manifestVersion: 1,
  optionalDependencies: [],
};

const KINDS: readonly string[] = ["skill", "agent", "mcp", "plugin"];
const SOURCE_TYPES: readonly string[] = ["bundled", "external-skill", "npm", "command", "url"];

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function requireNonEmptyString(
  value: unknown,
  path: string,
  errors: string[]
): asserts value is string {
  if (typeof value !== "string" || isBlank(value)) {
    errors.push(`${path}: expected a non-empty string`);
  }
}

function validateSource(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  const source = value as Record<string, unknown>;
  if (typeof source["type"] !== "string" || !SOURCE_TYPES.includes(source["type"])) {
    errors.push(`${path}.type: unknown source type (expected one of ${SOURCE_TYPES.join(", ")})`);
    return;
  }
  switch (source["type"]) {
    case "bundled":
      requireNonEmptyString(source["path"], `${path}.path`, errors);
      break;
    case "external-skill":
      requireNonEmptyString(source["repo"], `${path}.repo`, errors);
      requireNonEmptyString(source["skill"], `${path}.skill`, errors);
      break;
    case "npm":
      requireNonEmptyString(source["package"], `${path}.package`, errors);
      break;
    case "command":
      requireNonEmptyString(source["command"], `${path}.command`, errors);
      break;
    case "url":
      requireNonEmptyString(source["url"], `${path}.url`, errors);
      break;
  }
}

function validateOptionalDep(value: unknown, path: string, errors: string[]): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  const entry = value as Record<string, unknown>;
  requireNonEmptyString(entry["id"], `${path}.id`, errors);
  if (typeof entry["kind"] !== "string" || !KINDS.includes(entry["kind"])) {
    errors.push(`${path}.kind: unknown kind (expected one of ${KINDS.join(", ")})`);
  }
  requireNonEmptyString(entry["description"], `${path}.description`, errors);
  validateSource(entry["source"], `${path}.source`, errors);
}

export function validatePackageManifest(value: unknown): PackageManifestValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, errors: ["manifest: expected a JSON object"] };
  }
  const errors: string[] = [];
  const candidate = value as Record<string, unknown>;
  if (candidate["manifestVersion"] !== 1) {
    errors.push("manifestVersion: only 1 is supported");
  }
  const deps = candidate["optionalDependencies"];
  if (!Array.isArray(deps)) {
    errors.push("optionalDependencies: expected an array");
    return { ok: false, errors };
  }
  const seen = new Set<string>();
  const parsed: PackageOptionalDep[] = [];
  for (const [index, entry] of deps.entries()) {
    const path = `optionalDependencies[${index}]`;
    validateOptionalDep(entry, path, errors);
    const id = (entry as Record<string, unknown>)["id"];
    if (typeof id === "string" && !isBlank(id)) {
      if (seen.has(id)) {
        errors.push(`${path}.id: duplicate id "${id}"`);
      }
      seen.add(id);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    manifest: { manifestVersion: 1, optionalDependencies: deps as PackageOptionalDep[] },
  };
}
