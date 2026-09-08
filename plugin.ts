import type { Plugin, Config } from "@opencode-ai/plugin";
import { readLocalConfig, mergeConfigWithOverrides } from "./src/installer.ts";

const TASK_SKILL_NAMES = ["test-baselining", "regression-checking", "grilling"] as const;

function setTaskSkillPermissions(input: Config): void {
  input.agent ??= {};
  input.agent.task ??= {};

  const taskAgent = input.agent.task as Record<string, unknown>;
  taskAgent.permission ??= {};

  const permission = taskAgent.permission as Record<string, unknown>;
  permission.skill ??= {};
  const skillPermissions = permission.skill as Record<string, string>;

  for (const skillName of TASK_SKILL_NAMES) {
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

const plugin: Plugin = async ({ directory }) => ({
  config: async (input: Config) => {
    setTaskSkillPermissions(input);
    await mergeExistingLocalOverrides(input as Record<string, unknown>, directory);
  },
});

export default plugin;
