import {
  getGlobalConfigPath,
  getLocalConfigPath,
  getPackageName,
  isPluginInConfigBase,
  isScopeInstalled,
  type Scope,
} from "./installer.ts";

export type RegistrationContext = "none" | "global" | "repo-local" | "both";

export class RegistrationDetector {
  static async detect(directory: string): Promise<RegistrationContext> {
    const packageName = await getPackageName();
    const globalRegistered = await isPluginInConfigBase(getGlobalConfigPath(), packageName);
    const repoLocalRegistered = await RegistrationDetector.isRegisteredInRepo(directory, packageName);

    if (globalRegistered && repoLocalRegistered) {
      return "both";
    }
    if (globalRegistered) {
      return "global";
    }
    if (repoLocalRegistered) {
      return "repo-local";
    }
    return "none";
  }

  static scopesToEnsure(context: RegistrationContext): Scope[] {
    if (context === "both") {
      return ["global", "local"];
    }
    if (context === "global") {
      return ["global"];
    }
    if (context === "repo-local") {
      return ["local"];
    }
    return [];
  }

  static async hasAnyInstallation(directory: string): Promise<boolean> {
    const packageName = await getPackageName();
    const globalInstalled = await isScopeInstalled(getGlobalConfigPath(), packageName);
    if (globalInstalled) {
      return true;
    }
    return isScopeInstalled(getLocalConfigPath(directory), packageName);
  }

  private static async isRegisteredInRepo(directory: string, packageName: string): Promise<boolean> {
    const nestedConfigBase = getLocalConfigPath(directory);
    if (await isPluginInConfigBase(nestedConfigBase, packageName)) {
      return true;
    }
    return isPluginInConfigBase(directory, packageName);
  }
}
