import type { Plugin, Config, PluginInput } from "@opencode-ai/plugin";
import { install, readLocalConfig, mergeConfigWithOverrides, type Scope, type InstallResult } from "./src/installer.ts";
import { RegistrationDetector } from "./src/registration.ts";
import { findPendingOptionalDeps } from "./src/load-advisory.ts";

const PLUGIN_SERVICE_NAME = "opencode-auto-qcgates";
const ADVISORY_TOAST_DURATION_MS = 10000;
const INSTALL_ADVISORY_MESSAGE = `${PLUGIN_SERVICE_NAME} is not installed in any scope. Run "bunx opencode-auto-qcgates install --scope global" to enable the quality-gate skills and commands.`;
const LOAD_INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false };

type PluginClient = PluginInput["client"] | undefined;

interface AdvisoryState {
  emitted: boolean;
}

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
  try {
    await log({ body: { service: PLUGIN_SERVICE_NAME, level: "warn", message } });
  } catch {
    console.warn(`[${PLUGIN_SERVICE_NAME}] ${message}`);
  }
}

async function showToastAdvisory(client: PluginClient, message: string): Promise<void> {
  try {
    await client?.tui?.showToast?.({
      body: {
        title: PLUGIN_SERVICE_NAME,
        message,
        variant: "warning",
        duration: ADVISORY_TOAST_DURATION_MS,
      },
    });
  } catch {
    return;
  }
}

async function emitAdvisoryOnce(state: AdvisoryState, client: PluginClient, message: string): Promise<void> {
  if (state.emitted) {
    return;
  }
  state.emitted = true;
  await logWarn(client, message);
  await showToastAdvisory(client, message);
}

async function maybeEmitInstallAdvisory(state: AdvisoryState, client: PluginClient, directory: string): Promise<void> {
  if (state.emitted || (await RegistrationDetector.hasAnyInstallation(directory))) {
    return;
  }
  await emitAdvisoryOnce(state, client, INSTALL_ADVISORY_MESSAGE);
}

function pendingDepsAdvisoryMessage(ids: string[]): string {
  const count = ids.length;
  const noun = count === 1 ? "optional dependency" : "optional dependencies";
  const verb = count === 1 ? "is" : "are";
  const pronoun = count === 1 ? "it" : "them";
  return (
    `${PLUGIN_SERVICE_NAME}: ${count} ${noun} (${ids.join(", ")}) ${verb} available but pending your decision. ` +
    `Run "bunx ${PLUGIN_SERVICE_NAME}" (no arguments) to review ${pronoun} in the interactive menu. ` +
    `Nothing is installed automatically.`
  );
}

async function maybeEmitPendingDepsAdvisory(
  state: AdvisoryState,
  client: PluginClient,
  directory: string
): Promise<void> {
  if (state.emitted) {
    return;
  }
  const ids = await findPendingOptionalDeps(directory);
  if (ids.length === 0) {
    return;
  }
  await emitAdvisoryOnce(state, client, pendingDepsAdvisoryMessage(ids));
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

const plugin: Plugin = async ({ directory, client }) => {
  const advisoryState: AdvisoryState = { emitted: false };

  return {
    config: async (input: Config) => {
      setTaskSkillPermissions(input);
      await mergeExistingLocalOverrides(input as Record<string, unknown>, directory);

      const context = await RegistrationDetector.detect(directory);
      const scopes = RegistrationDetector.scopesToEnsure(context);

      if (scopes.length === 0) {
        await maybeEmitInstallAdvisory(advisoryState, client, directory);
        return;
      }

      for (const scope of scopes) {
        await ensureScopeAssets(client, scope, directory);
      }

      await maybeEmitPendingDepsAdvisory(advisoryState, client, directory);
    },
  };
};

export default plugin;
