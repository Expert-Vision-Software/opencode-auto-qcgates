import type { Plugin, Config, PluginInput } from "@opencode-ai/plugin";
import { install, readLocalConfig, mergeConfigWithOverrides, type Scope, type InstallResult } from "./src/installer.ts";
import { RegistrationDetector } from "./src/registration.ts";

const PLUGIN_SERVICE_NAME = "opencode-auto-qcgates";
const LOAD_INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false };

type PluginClient = PluginInput["client"] | undefined;

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

async function mergeExistingLocalOverrides(input: Record<string, unknown>, directory: string): Promise<void> {
  const localConfig = await readLocalConfig(directory);
  if (localConfig === null) {
    return;
  }
  mergeConfigWithOverrides(input, localConfig);
}

async function logWarn(client: PluginClient, message: string): Promise<void> {
  const log = client?.app?.log;
  if (!log) {
    console.warn(`[${PLUGIN_SERVICE_NAME}] ${message}`);
    return;
  }
  await log({ body: { service: PLUGIN_SERVICE_NAME, level: "warn", message } });
}

async function reportLoadSkippedFiles(client: PluginClient, result: InstallResult): Promise<void> {
  for (const skippedPath of result.skipped) {
    await logWarn(
      client,
      `Skipped consumer-modified file (re-run "bunx opencode-auto-qcgates install --force" to overwrite): ${skippedPath}`
    );
  }
}

async function ensureScopeAssets(client: PluginClient, scope: Scope, directory: string): Promise<InstallResult> {
  const result = await install(scope, directory, LOAD_INSTALL_OPTIONS);
  await reportLoadSkippedFiles(client, result);
  return result;
}

const plugin: Plugin = async ({ directory, client }) => ({
  config: async (input: Config) => {
    setTaskSkillPermissions(input);
    await mergeExistingLocalOverrides(input as Record<string, unknown>, directory);

    const context = await RegistrationDetector.detect(directory);
    for (const scope of RegistrationDetector.scopesToEnsure(context)) {
      await ensureScopeAssets(client, scope, directory);
    }
  },
});

export default plugin;
