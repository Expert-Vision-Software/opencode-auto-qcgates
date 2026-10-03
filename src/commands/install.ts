import { select } from "@inquirer/prompts";
import {
  install,
  resolveMode,
  checkMigrationNeeded,
  printRecommendations,
  type InstallMode,
  type Scope,
  type InstallOptions,
} from "../installer.ts";
import { confirmOverwrite } from "../prompts.ts";

interface InstallCommandOptions {
  scope: Scope | null;
  force: boolean;
  mode: InstallMode | null;
  migrate: boolean;
}

export async function installCommand(options: InstallCommandOptions): Promise<void> {
  const packageName = await Bun.file(`${import.meta.dirname}/../../package.json`).text().then(t => JSON.parse(t).name);

  let scope: Scope;

  if (options.scope) {
    scope = options.scope;
  } else {
    const selected = await select({
      message: `Where do you want to install ${packageName}?`,
      choices: [
        { name: "Local (project only)", value: "local" as Scope },
        { name: "Global (all projects)", value: "global" as Scope },
      ],
    });
    scope = selected;
  }

  const projectDir = process.cwd();

  if (scope === "local" && options.migrate) {
    const migration = await checkMigrationNeeded(projectDir);

    if (migration.needed && migration.rootConfig && migration.dotOpenencodeConfig) {
      const dotConfig = migration.dotOpenencodeConfig as Record<string, unknown>;
      const hasConflict = Object.keys(migration.rootConfig).some(
        key => key in dotConfig
      );

      if (hasConflict) {
        const shouldContinue = await confirmOverwrite(
          "Both opencode.json and .opencode/opencode.json exist with conflicting keys. Continue with migration (.opencode takes precedence)?"
        );
        if (!shouldContinue) {
          console.log("Installation cancelled.");
          return;
        }
      }
    }
  }

  const resolvedMode = await resolveMode(options.mode);
  const installOptions: InstallOptions = {
    addPluginConfig: resolvedMode === "plugin",
    migrateRootConfig: options.migrate,
    force: options.force,
  };

  const result = await install(scope, projectDir, installOptions, options.mode);

  if (result.action === "noop") {
    console.log(`\n${packageName} is already up to date in the ${scope} location:`);
  } else {
    console.log(`\nInstalled ${packageName} ${scope === "global" ? "globally" : "locally"}:`);
  }

  console.log(`  Mode: ${result.mode}`);
  if (result.skillPaths.length > 0) {
    console.log(`  Skills: ${result.skillPaths.join(", ")}`);
  }
  if (result.commandPaths.length > 0) {
    console.log(`  Commands: ${result.commandPaths.join(", ")}`);
  }
  if (result.entry !== null) {
    console.log(`  Plugin entry: ${result.entry} in ${result.configPath ?? "(unknown config)"}`);
  }
  console.log(`  Manifest: ${result.manifestPath}`);

  for (const skippedPath of result.skipped) {
    console.log(`  Skipped (changed locally; re-run with --force to overwrite): ${skippedPath}`);
  }

  if (result.migrated) {
    console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
  }

  for (const cleared of result.clearedCache) {
    console.log(`  Cleared cache: ${cleared}`);
  }

  printRecommendations(result.recommendations);
}
