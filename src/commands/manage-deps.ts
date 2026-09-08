import { select } from "@inquirer/prompts";
import { join } from "node:path";
import { getGlobalConfigPath, getLocalConfigPath, type Scope } from "../installer.ts";
import { InstallManifest } from "../manifest.ts";
import {
  applyOptionalDepDecisions,
  isInteractiveStdio,
  printDepRunResult,
  type CommandExecutor,
} from "../optional-deps-actions.ts";
import type { InstallOptionalDep } from "../optional-deps.ts";

export interface ManageDepsOptions {
  scope?: Scope;
  interactive?: boolean;
  projectDir?: string;
  select?: (deps: InstallOptionalDep[]) => Promise<string[]>;
  exec?: CommandExecutor;
}

export function formatOptionalDepStates(deps: InstallOptionalDep[]): string[] {
  return deps.map(dep => `  ${dep.id} (${dep.kind}): ${dep.state}`);
}

export async function selectManageableOptionalDeps(deps: InstallOptionalDep[]): Promise<string[]> {
  const { checkbox } = await import("@inquirer/prompts");
  return checkbox({
    message: "Manage optional dependencies — check to accept/apply, leave unchecked to decline:",
    choices: deps.map(dep => ({
      name: `${dep.id} (${dep.kind}, ${dep.state}) — ${dep.description}`,
      value: dep.id,
      checked: dep.state === "accepted",
    })),
  });
}

async function resolvePackageName(): Promise<string> {
  const content = await Bun.file(`${import.meta.dirname}/../../package.json`).text();
  return JSON.parse(content).name as string;
}

export async function manageDepsCommand(options: ManageDepsOptions): Promise<void> {
  const packageName = await resolvePackageName();
  const interactive = options.interactive ?? isInteractiveStdio();

  let scope = options.scope;
  if (!scope) {
    if (!interactive) {
      throw new Error(`--scope (local|global) is required in non-interactive sessions.`);
    }
    scope = await select({
      message: `Which installation do you want to manage optional dependencies for?`,
      choices: [
        { name: "Local (project only)", value: "local" as Scope },
        { name: "Global (all projects)", value: "global" as Scope },
      ],
    });
  }

  const projectDir = options.projectDir ?? process.cwd();
  const configBase = scope === "global" ? getGlobalConfigPath() : getLocalConfigPath(projectDir);
  const manifestPath = join(configBase, `${packageName}.manifest.json`);

  const manifest = await InstallManifest.read(manifestPath);
  if (!manifest.hasContents()) {
    console.log(`\n${packageName} is not installed in the ${scope} location. Run install first.`);
    return;
  }

  const deps = manifest.optionalDependencies;
  if (deps.length === 0) {
    console.log(`\nNo optional dependencies are declared for ${packageName}.`);
    return;
  }

  if (!interactive) {
    console.log(`\nOptional dependencies (${scope}):`);
    for (const line of formatOptionalDepStates(deps)) {
      console.log(line);
    }
    console.log(`  Non-interactive session — nothing was changed.`);
    return;
  }

  const selectDeps = options.select ?? selectManageableOptionalDeps;
  const acceptedIds = await selectDeps(deps);

  const result = await applyOptionalDepDecisions(
    {
      scope,
      configBase,
      configPath: join(configBase, "opencode.json"),
      manifestPath,
      packageDir: join(import.meta.dirname, "..", ".."),
      packageName,
    },
    deps,
    acceptedIds,
    options.exec
  );
  printDepRunResult(result);
}
