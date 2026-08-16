import type { Plugin, Config } from "@opencode-ai/plugin";
import { install, getGlobalConfigPath, getPackageVersion, ScopeResolver, isLocalInstalled, readLocalConfig, mergeConfigWithOverrides } from "./src/installer.ts";
import { join } from "node:path";

const SKILL_NAMES = ["test-baselining", "regression-checking"] as const;

function setExploreSkillPermissions(input: Config): void {
  input.agent ??= {};
  input.agent.explore ??= {};
  input.agent.explore.permission ??= {};
  const perm = input.agent.explore.permission as Record<string, unknown>;
  perm.skill ??= {};
  const skillPerm = perm.skill as Record<string, string>;
  skillPerm["test-baselining"] = "allow";
  skillPerm["regression-checking"] = "allow";
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
          setExploreSkillPermissions(input);
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
      setExploreSkillPermissions(input);
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
          setExploreSkillPermissions(input);
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

      const newLocalConfig = await readLocalConfig(directory);
      if (newLocalConfig) {
        mergeConfigWithOverrides(input as Record<string, unknown>, newLocalConfig);
      }
      setExploreSkillPermissions(input);
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

        const localConfig = await readLocalConfig(directory);
        if (localConfig) {
          mergeConfigWithOverrides(input as Record<string, unknown>, localConfig);
        }
        setExploreSkillPermissions(input);
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

    const finalLocalConfig = await readLocalConfig(directory);
    if (finalLocalConfig) {
      mergeConfigWithOverrides(input as Record<string, unknown>, finalLocalConfig);
    }
    setExploreSkillPermissions(input);
  },
});

export default plugin;