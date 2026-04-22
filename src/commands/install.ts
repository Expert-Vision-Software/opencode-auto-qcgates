import { select } from "@inquirer/prompts";
import {
  install,
  checkMigrationNeeded,
  type Scope,
  type InstallOptions,
} from "../installer.ts";
import { confirmOverwrite, confirmPluginConfig } from "../prompts.ts";

interface InstallCommandOptions {
  scope?: Scope;
  force?: boolean;
}

export async function installCommand(options: InstallCommandOptions): Promise<void> {
  const packageName = await Bun.file(`${import.meta.dirname}/../../package.json`).text().then(t => JSON.parse(t).name);

  let scope: Scope;
  const interactive = !options.scope;

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

  if (scope === "local") {
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

  let installOptions: InstallOptions = {
    addPluginConfig: true,
  };

  if (interactive) {
    const addPluginConfig = await confirmPluginConfig();

    installOptions = {
      addPluginConfig,
    };
  }

  const result = await install(scope, projectDir, installOptions);

  console.log(`\nInstalled ${packageName} ${scope === "global" ? "globally" : "locally"}:`);
  if (result.skillPaths.length > 0) {
    console.log(`  Skills: ${result.skillPaths.join(", ")}`);
  }
  if (result.commandPaths.length > 0) {
    console.log(`  Commands: ${result.commandPaths.join(", ")}`);
  }
  console.log(`  Config: ${result.configPath}`);

  if (result.migrated) {
    console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
  }

  if (result.pluginAdded) {
    console.log(`  Plugin: added to config`);
  }
}