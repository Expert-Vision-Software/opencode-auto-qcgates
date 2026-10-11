import { Effect, type Scope } from "effect";
import { Agent, Plugin } from "@opencode/plugin/effect";
import {
  install,
  getPackageName,
  getPackageVersion,
  type Scope as InstallScope,
} from "./installer.ts";
import { RegistrationDetector } from "./registration.ts";
import { CacheCleaner } from "./cache-cleaner.ts";

const PLUGIN_SERVICE_NAME = "opencode-auto-qcgates";
const INSTALL_ADVISORY_MESSAGE = `${PLUGIN_SERVICE_NAME} is not installed in any scope. Run "bunx opencode-auto-qcgates install --scope global" to enable the quality-gate skills and commands.`;
const LOAD_INSTALL_OPTIONS = { addPluginConfig: false, migrateRootConfig: false, force: false };
const LOAD_PRUNE_CACHE = false;
const FALLBACK_CACHE_DIR = "~/.cache/opencode/npm/opencode-auto-qcgates@<version>";
const TASK_AGENT_ID = "task";
const TASK_SKILL_RESOURCES = ["test-baselining", "regression-checking", "grilling"];

type PermissionRule = Agent.Info["permissions"][number];

let notInstalledAdvised = false;
let failureAdvised = false;

const cacheCleaner = new CacheCleaner();

const TASK_SKILL_RULES: PermissionRule[] = TASK_SKILL_RESOURCES.map((resource) => ({
  action: "skill",
  resource,
  effect: "allow",
}));

function logWarn(message: string): void {
  try {
    console.warn(`[${PLUGIN_SERVICE_NAME}] ${message}`);
  } catch {}
}

async function adviseNotInstalledOnce(): Promise<void> {
  if (notInstalledAdvised) {
    return;
  }
  notInstalledAdvised = true;
  logWarn(INSTALL_ADVISORY_MESSAGE);
}

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

async function adviseFailureOnce(error: unknown): Promise<void> {
  if (failureAdvised) {
    return;
  }
  failureAdvised = true;
  let message: string;
  try {
    message = await buildFailureMessage(error);
  } catch {
    message = buildFailureFallbackMessage();
  }
  logWarn(message);
}

function advisoryEffect(run: () => Promise<void>): Effect.Effect<void, never> {
  return Effect.asVoid(
    Effect.orElseSucceed(Effect.tryPromise({ try: run, catch: () => "advisory failed" }), () => undefined),
  );
}

function mergeTaskSkillRules(existing: ReadonlyArray<PermissionRule>): PermissionRule[] {
  const ruledResources = new Set(
    existing.filter((rule) => rule.action === "skill").map((rule) => rule.resource)
  );
  const unruled = TASK_SKILL_RULES.filter((rule) => !ruledResources.has(rule.resource));
  return [...existing, ...unruled];
}

function seedTaskSkillPermissions(context: Plugin.Context): Effect.Effect<void, never, Scope.Scope> {
  return Effect.asVoid(
    context.agent.transform((editor) => {
      const task = editor.get(TASK_AGENT_ID);
      if (!task) {
        return;
      }
      editor.update(TASK_AGENT_ID, (agent) => {
        agent.permissions = mergeTaskSkillRules(agent.permissions);
      });
    }),
  );
}

async function ensureScopeAssets(scope: InstallScope, directory: string): Promise<void> {
  const result = await install(scope, directory, LOAD_INSTALL_OPTIONS, null, LOAD_PRUNE_CACHE);
  for (const skippedPath of result.skipped) {
    logWarn(
      `Skipped consumer-modified file (re-run "bunx opencode-auto-qcgates install --force" to overwrite): ${skippedPath}`
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selfEnsureEffect(context: Plugin.Context): Effect.Effect<void, string, Scope.Scope> {
  return Effect.gen(function* () {
    yield* seedTaskSkillPermissions(context);
    const directory = context.location.directory;
    const detected = yield* Effect.tryPromise({
      try: () => RegistrationDetector.detect(directory),
      catch: describeError,
    });
    const scopes = RegistrationDetector.scopesToEnsure(detected);
    if (scopes.length === 0) {
      yield* Effect.tryPromise({
        try: async () => {
          if (await RegistrationDetector.hasAnyInstallation(directory)) {
            return;
          }
          await adviseNotInstalledOnce();
        },
        catch: describeError,
      });
      return;
    }
    for (const scope of scopes) {
      yield* Effect.tryPromise({
        try: () => ensureScopeAssets(scope, directory),
        catch: describeError,
      });
    }
  });
}

function runStartupSelfEnsure(context: Plugin.Context): Effect.Effect<void, never, Scope.Scope> {
  return Effect.catch(selfEnsureEffect(context), (message) => advisoryEffect(() => adviseFailureOnce(message)));
}

const plugin = Plugin.define({
  id: PLUGIN_SERVICE_NAME,
  effect: Effect.fn(function* (context: Plugin.Context) {
    yield* runStartupSelfEnsure(context);
  }),
});

export default plugin;
