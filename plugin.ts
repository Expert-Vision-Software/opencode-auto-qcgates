import type { Plugin } from "@opencode-ai/plugin";
import { install, getGlobalConfigPath, getLocalConfigPath, getPackageVersion, type Scope } from "./src/installer.ts";
import { join } from "node:path";

const SKILL_NAMES = ["test-baselining", "regression-checking"] as const;

const plugin: Plugin = async ({ directory }) => ({
  config: async () => {
    const version = await getPackageVersion();
    const globalConfigPath = getGlobalConfigPath();
    const globalVersionMarker = join(globalConfigPath, "skills", "test-baselining", ".version");

    const isGlobalInstall = directory === globalConfigPath ||
      directory.startsWith(globalConfigPath + "/") ||
      directory.startsWith(globalConfigPath + "\\");

    let scope: Scope;

    if (isGlobalInstall) {
      scope = "global";
    } else {
      try {
        const globalVersion = (await Bun.file(globalVersionMarker).text()).trim();
        if (globalVersion === version) {
          return;
        }
      } catch {
        // Global not installed, proceed with local
      }
      scope = "local";
    }

    const marker = scope === "global"
      ? globalVersionMarker
      : join(directory, ".opencode", "skills", "test-baselining", ".version");

    try {
      const installedVersion = (await Bun.file(marker).text()).trim();
      if (installedVersion === version) {
        return;
      }
    } catch {
      // Not installed, proceed
    }

    const result = await install(scope, directory);
    console.log(`\nInstalled opencode-auto-qcgates ${scope === "global" ? "globally" : "locally"}:`);
    if (result.skillPaths.length > 0) {
      console.log(`  Skills: ${result.skillPaths.join(", ")}`);
    }
    if (result.commandPaths.length > 0) {
      console.log(`  Commands: ${result.commandPaths.join(", ")}`);
    }
    if (result.migrated) {
      console.log(`  Migrated: opencode.json → .opencode/opencode.json`);
    }
  },
});

export default plugin;