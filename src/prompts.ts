import { checkbox, confirm } from "@inquirer/prompts";
import type { InstallOptionalDep } from "./optional-deps.ts";

export async function confirmOverwrite(message: string): Promise<boolean> {
  return confirm({
    message,
    default: false,
  });
}

export async function confirmPluginConfig(): Promise<boolean> {
  return confirm({
    message: "Add plugin to opencode.json config?",
    default: true,
  });
}

export function isInteractiveStdio(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function selectPendingOptionalDeps(pending: InstallOptionalDep[]): Promise<string[]> {
  return checkbox({
    message: "Optional dependencies — check to accept, leave unchecked to decline:",
    choices: pending.map(dep => ({
      name: `${dep.id} (${dep.kind}) — ${dep.description}`,
      value: dep.id,
      checked: false,
    })),
  });
}

export async function selectManageableOptionalDeps(deps: InstallOptionalDep[]): Promise<string[]> {
  return checkbox({
    message:
      "Manage optional dependencies — check to accept/apply. Accepted dependencies stay accepted when left unchecked:",
    choices: deps.map(dep => ({
      name: `${dep.id} (${dep.kind}, ${dep.state}) — ${dep.description}`,
      value: dep.id,
      checked: dep.state === "accepted",
    })),
  });
}

export function printDepRunResult(result: {
  applied: Array<{ id: string; message: string }>;
  declined: string[];
  failed: Array<{ id: string; reason: string }>;
}): void {
  for (const entry of result.applied) {
    console.log(`  ${entry.message}`);
  }
  if (result.declined.length > 0) {
    console.log(`  Declined (recorded): ${result.declined.join(", ")}`);
  }
  for (const failure of result.failed) {
    console.warn(`  Failed: ${failure.id} — ${failure.reason}`);
  }
}
