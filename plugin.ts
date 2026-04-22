import type { Plugin } from "@opencode-ai/plugin";
import { install, getGlobalConfigPath, getLocalConfigPath, type Scope } from "./src/installer.ts";
import { exists, readdir } from "node:fs/promises";
import { join } from "node:path";

const plugin: Plugin = async ({ directory }) => ({
  config: async () => {
    const globalConfigPath = getGlobalConfigPath();
    const localConfigPath = getLocalConfigPath(directory);

    const isGlobalInstall = directory === globalConfigPath ||
      directory.startsWith(globalConfigPath + "/") ||
      directory.startsWith(globalConfigPath + "\\");

    const scope: Scope = isGlobalInstall ? "global" : "local";

    const configBase = scope === "global" ? globalConfigPath : localConfigPath;
    const skillsPath = join(configBase, "skills");

    let isInstalled = false;
    try {
      if (await exists(skillsPath)) {
        const entries = await readdir(skillsPath, { withFileTypes: true });
        isInstalled = entries.some(e => e.isDirectory());
      }
    } catch {
      // Not installed
    }

    if (!isInstalled) {
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
    }
  },
});

export default plugin;