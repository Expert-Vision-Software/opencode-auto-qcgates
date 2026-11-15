import type { InstallOptions } from "../src/installer.ts";

export const INSTALL_OPTIONS: InstallOptions = {
  addPluginConfig: false,
  migrateRootConfig: false,
  force: false,
  declineOptional: [],
};

export function installOptions(overrides: Partial<InstallOptions> = {}): InstallOptions {
  return { ...INSTALL_OPTIONS, ...overrides };
}
