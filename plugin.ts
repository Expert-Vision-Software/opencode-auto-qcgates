import type { Plugin } from "@opencode-ai/plugin";
import { install } from "./src/installer.ts";

const CHANGE_THRESHOLD = 3;
const IGNORED_EXTENSIONS = [".md", ".json", ".yaml", ".yml", ".txt", ".lock"];
const IGNORED_PATHS = [".opencode/", "node_modules/", ".git/"];

function isCodeChange(filePath: string): boolean {
  const ext = "." + filePath.split(".").pop()!.toLowerCase();
  if (IGNORED_EXTENSIONS.includes(ext)) return false;
  return !IGNORED_PATHS.some((ignored) => filePath.includes(ignored));
}

let changedFiles: string[] = [];

const plugin: Plugin = async ({ directory, client }) => ({
  config: async () => {
    await install("local", directory);
  },
  event: async ({ event }) => {
    if (event.type === "file.edited" && isCodeChange(event.properties.file)) {
      changedFiles.push(event.properties.file);
    } else if (event.type === "session.idle" && changedFiles.length >= CHANGE_THRESHOLD) {
      await client.tui.executeCommand({
        body: { command: "/test-baseline eval" },
      });
      changedFiles = [];
    } else if (event.type === "session.idle") {
      changedFiles = [];
    }
  },
});

export default plugin;
