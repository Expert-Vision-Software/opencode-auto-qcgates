import type { Plugin } from "@opencode-ai/plugin";
import { install } from "./src/installer.ts";

const IGNORED_EXTENSIONS = [".md", ".json", ".yaml", ".yml", ".txt", ".lock"];
const IGNORED_PATHS = [".opencode/", "node_modules/", ".git/"];

function isCodeChange(filePath: string): boolean {
  const ext = "." + filePath.split(".").pop()!.toLowerCase();
  if (IGNORED_EXTENSIONS.includes(ext)) return false;
  return !IGNORED_PATHS.some((ignored) => filePath.includes(ignored));
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 2000;

const plugin: Plugin = async ({ directory, client }) => ({
  config: async () => {
    await install("local", directory);
  },
  event: async ({ event }) => {
    if (event.type === "file.edited" && isCodeChange(event.properties.file)) {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        await client.tui.executeCommand({
          body: { command: "/test-baseline eval" },
        });
      }, DEBOUNCE_MS);
    }
  },
});

export default plugin;
