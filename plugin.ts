import type { Plugin } from "@opencode-ai/plugin";
import { install } from "./src/installer.ts";

const plugin: Plugin = async ({ directory }) => ({
  config: async () => {
    await install("local", directory);
  },
});

export default plugin;
