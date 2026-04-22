import { confirm } from "@inquirer/prompts";

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