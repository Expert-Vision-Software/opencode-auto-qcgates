import { readFile } from "node:fs/promises";
import { join } from "node:path";

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
const SOURCE_REQUIRED_FIELDS: Record<string, readonly string[]> = {
  bundled: ["path"],
  "external-skill": ["repo", "skill"],
  npm: ["package"],
  command: ["command"],
  url: ["url"],
};

export const PACKAGE_MANIFEST_RELPATH = "manifest.json";

export async function loadPackageManifest(packageDir: string): Promise<PackageManifestValidation> {
  let raw: string;
  try {
    raw = await readFile(join(packageDir, PACKAGE_MANIFEST_RELPATH), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: true, manifest: EMPTY_PACKAGE_MANIFEST };
    }
    return { ok: false, errors: [`failed to read ${PACKAGE_MANIFEST_RELPATH}: ${String(error)}`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      errors: [`${PACKAGE_MANIFEST_RELPATH} is not valid JSON: ${String(error)}`],
    };
  }
  return validatePackageManifest(parsed);
}

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
  if (typeof source["type"] !== "string" || SOURCE_REQUIRED_FIELDS[source["type"]] === undefined) {
    errors.push(`${path}.type: unknown source type (expected one of ${SOURCE_TYPES.join(", ")})`);
    return;
  }
  for (const field of SOURCE_REQUIRED_FIELDS[source["type"]]) {
    requireNonEmptyString(source[field], `${path}.${field}`, errors);
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

export function isValidOptionalDepEntry(value: unknown): value is PackageOptionalDep {
  const errors: string[] = [];
  validateOptionalDep(value, "optionalDependencies[?]", errors);
  return errors.length === 0;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(entry => canonical(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameDeclaration(a: PackageOptionalDep, b: PackageOptionalDep): boolean {
  return a.kind === b.kind && canonical(a.source) === canonical(b.source);
}

export interface OptionalDepMergeResult {
  dependencies: InstallOptionalDep[];
  changed: boolean;
}

export function mergeOptionalDependencies(
  existing: InstallOptionalDep[] | undefined,
  declared: PackageOptionalDep[]
): OptionalDepMergeResult {
  const prior = existing ?? [];
  const priorById = new Map(prior.map(entry => [entry.id, entry]));
  const merged: InstallOptionalDep[] = [];

  for (const dep of declared) {
    const priorEntry = priorById.get(dep.id);
    if (priorEntry === undefined) {
      merged.push({ ...dep, state: "pending" });
      continue;
    }
    const state: OptionalDepState = sameDeclaration(dep, priorEntry) ? priorEntry.state : "pending";
    merged.push({ ...dep, state });
  }

  const declaredIds = new Set(declared.map(dep => dep.id));
  for (const entry of prior) {
    if (!declaredIds.has(entry.id)) {
      merged.push(entry);
    }
  }

  return {
    dependencies: merged,
    changed: canonical(merged) !== canonical(prior),
  };
}
