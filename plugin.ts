import type { Plugin, Config } from "@opencode-ai/plugin";
import { install, getGlobalConfigPath, getPackageVersion, ScopeResolver, isLocalInstalled, readLocalConfig, mergeConfigWithOverrides, printRecommendations } from "./src/installer.ts";
import { join } from "node:path";

const SKILL_NAMES = ["test-baselining", "regression-checking", "grilling"] as const;

function setTaskSkillPermissions(input: Config): void {
  input.agent ??= {};
  input.agent.task ??= {};

  const taskAgent = input.agent.task as Record<string, unknown>;
  taskAgent.permission ??= {};

  const permission = taskAgent.permission as Record<string, unknown>;
  permission.skill ??= {};
  const skillPermissions = permission.skill as Record<string, string>;

  for (const skillName of ["test-baselining", "regression-checking", "grilling"]) {
    skillPermissions[skillName] = "allow";
  }
}

const plugin: Plugin = async ({ directory }) => ({
  config: async (input: Config) => {
    const version = await getPackageVersion();
    const globalConfigPath = getGlobalConfigPath();
    const globalVersionMarker = join(globalConfigPath, "skills", "test-baselining", ".version");

    const scope = ScopeResolver.resolve(directory, globalConfigPath);

    if (scope === "global") {
      const marker = globalVersionMarker;
      try {
        const installedVersion = (await Bun.file(marker).text()).trim();
        if (installedVersion === version) {
          setTaskSkillPermissions(input);
          return;
        }
      } catch {
        // Not installed, proceed
      }

      const result = await install("global", directory);
      console.log(`\nInstalled opencode-auto-qcgates globally:`);
      if (result.skillPaths.length > 0) {
        console.log(`  Skills: ${result.skillPaths.join(", ")}`);
      }
      if (result.commandPaths.length > 0) {
        console.log(`  Commands: ${result.commandPaths.join(", ")}`);
      }
      printRecommendations(result.recommendations);
      setTaskSkillPermissions(input);
      return;
    }

    const localMarker = join(directory, ".opencode", "skills", "test-baselining", ".version");
    const localInstalled = await isLocalInstalled(directory);

    if (localInstalled) {
      try {
        const installedVersion = (await Bun.file(localMarker).text()).trim();
        if (installedVersion === version) {
          const localConfig = await readLocalConfig(directory);
          if (localConfig) {
            mergeConfigWithOverrides(input as Record<string, unknown>, localConfig);
          }
          setTaskSkillPermissions(input);
          return;
        }
      } catch {
        // Proceed with install
      }

      const result = await install("local", directory);
      console.log(`\nInstalled opencode-auto-qcgates locally:`);
      if (result.skillPaths.length > 0) {
        console.log(`  Skills: ${result.skillPaths.join(", ")}`);
      }
      if (result.commandPaths.length > 0) {
        console.log(`  Commands: ${result.commandPaths.join(", ")}`);
      }
      if (result.migrated) {
        console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
      }
      printRecommendations(result.recommendations);

      const newLocalConfig = await readLocalConfig(directory);
      if (newLocalConfig) {
        mergeConfigWithOverrides(input as Record<string, unknown>, newLocalConfig);
      }
      setTaskSkillPermissions(input);
      return;
    }

    try {
      const globalVersion = (await Bun.file(globalVersionMarker).text()).trim();
      if (globalVersion === version) {
        const result = await install("local", directory);
        console.log(`\nInstalled opencode-auto-qcgates locally (overriding global):`);
        if (result.skillPaths.length > 0) {
          console.log(`  Skills: ${result.skillPaths.join(", ")}`);
        }
        if (result.commandPaths.length > 0) {
          console.log(`  Commands: ${result.commandPaths.join(", ")}`);
        }
        if (result.migrated) {
          console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
        }
        printRecommendations(result.recommendations);

        const localConfig = await readLocalConfig(directory);
        if (localConfig) {
          mergeConfigWithOverrides(input as Record<string, unknown>, localConfig);
        }
        setTaskSkillPermissions(input);
        return;
      }
    } catch {
      // Global not installed, proceed with local install
    }

    const result = await install("local", directory);
    console.log(`\nInstalled opencode-auto-qcgates locally:`);
    if (result.skillPaths.length > 0) {
      console.log(`  Skills: ${result.skillPaths.join(", ")}`);
    }
    if (result.commandPaths.length > 0) {
      console.log(`  Commands: ${result.commandPaths.join(", ")}`);
    }
    if (result.migrated) {
      console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
    }
    printRecommendations(result.recommendations);

    const finalLocalConfig = await readLocalConfig(directory);
    if (finalLocalConfig) {
      mergeConfigWithOverrides(input as Record<string, unknown>, finalLocalConfig);
    }
    setTaskSkillPermissions(input);
  },
});

export default plugin;