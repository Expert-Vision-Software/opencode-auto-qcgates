import type { Plugin, Config, PluginInput } from "@opencode-ai/plugin";
import {
  install,
  readLocalConfig,
  mergeConfigWithOverrides,
  getPackageName,
  getPackageVersion,
  type Scope,
  type InstallResult,
} from "./src/installer.ts";
import { RegistrationDetector } from "./src/registration.ts";
import { CacheCleaner } from "./src/cache-cleaner.ts";

const PLUGIN_SERVICE_NAME = "opencode-auto-qcgates";
const ADVISORY_TOAST_DURATION_MS = 10000;
const INSTALL_ADVISORY_MESSAGE = `${PLUGIN_SERVICE_NAME} is not installed in any scope. Run "bunx opencode-auto-qcgates install --scope global" to enable the quality-gate skills and commands.`;
const LOAD_INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false };
const LOAD_PRUNE_CACHE = false;
const FALLBACK_CACHE_DIR = "~/.cache/opencode/packages/opencode-auto-qcgates@<version>";

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

async function maybeEmitInstallAdvisory(state: AdvisoryState, client: PluginClient, directory: string): Promise<void> {
  if (state.emitted || (await RegistrationDetector.hasAnyInstallation(directory))) {
    return;
  }
  state.emitted = true;
  await logWarn(client, INSTALL_ADVISORY_MESSAGE);
  await showToastAdvisory(client, INSTALL_ADVISORY_MESSAGE);
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
  const result = await install(scope, directory, LOAD_INSTALL_OPTIONS, null, LOAD_PRUNE_CACHE);
  await reportLoadSkippedFiles(client, result);
  return result;
}

const cacheCleaner = new CacheCleaner();

function getCacheDirDisplay(packageName: string, packageVersion: string): string {
  return `${cacheCleaner.packagesCacheRootDisplay()}/${packageName}@${packageVersion}`;
}

async function buildFailureMessage(error: unknown): Promise<string> {
  const detail = error instanceof Error ? error.message : String(error);
  const packageName = await getPackageName();
  const cacheDir = getCacheDirDisplay(packageName, await getPackageVersion());
  return (
    `${PLUGIN_SERVICE_NAME} startup self-ensure failed: ${detail} Remedies: run ` +
    `"bunx ${packageName} install --scope global", then restart. If the OpenCode plugin ` +
    `cache is corrupt, run "bunx ${packageName} clear-cache" and restart ` +
    `(cache dir: ${cacheDir}).`
  );
}

function buildFailureFallbackMessage(): string {
  return (
    `${PLUGIN_SERVICE_NAME} startup self-ensure failed and the package metadata is unreadable. ` +
    `Remedies: run "bunx ${PLUGIN_SERVICE_NAME} install --scope global", then restart. ` +
    `If the OpenCode plugin cache is corrupt, run "bunx ${PLUGIN_SERVICE_NAME} clear-cache" ` +
    `and restart (cache dir: ${FALLBACK_CACHE_DIR}).`
  );
}

async function emitFailureAdvisory(client: PluginClient, error: unknown): Promise<void> {
  let message: string;
  try {
    message = await buildFailureMessage(error);
  } catch {
    message = buildFailureFallbackMessage();
  }
  await logWarn(client, message);
  await showToastAdvisory(client, message);
}

async function maybeEmitFailureAdvisory(
  state: AdvisoryState,
  client: PluginClient,
  error: unknown
): Promise<void> {
  if (state.emitted) {
    return;
  }
  state.emitted = true;
  await emitFailureAdvisory(client, error);
}

const plugin: Plugin = async ({ directory, client }) => {
  const installAdvisoryState: AdvisoryState = { emitted: false };
  const failureAdvisoryState: AdvisoryState = { emitted: false };

  return {
    config: async (input: Config) => {
      try {
        setTaskSkillPermissions(input);
        await mergeExistingLocalOverrides(input as Record<string, unknown>, directory);

        const context = await RegistrationDetector.detect(directory);
        const scopes = RegistrationDetector.scopesToEnsure(context);

        if (scopes.length === 0) {
          await maybeEmitInstallAdvisory(installAdvisoryState, client, directory);
          return;
        }

        for (const scope of scopes) {
          await ensureScopeAssets(client, scope, directory);
        }
      } catch (error) {
        await maybeEmitFailureAdvisory(failureAdvisoryState, client, error);
      }
    },
  };
};

export default plugin;
