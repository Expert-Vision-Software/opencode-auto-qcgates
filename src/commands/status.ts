import { status } from "../installer.ts";
import type { ScopeStatus } from "../installer.ts";

export async function statusCommand(): Promise<void> {
  const result = await status(process.cwd());

  const lines: string[] = [];

  if (result.local?.installed) {
    lines.push(formatScope("Local", result.local));
  } else {
    lines.push("Local: not installed");
  }

  if (result.global?.installed) {
    lines.push(formatScope("Global", result.global));
  } else {
    lines.push("Global: not installed");
  }

  console.log(lines.join("\n"));
}

function formatScope(label: string, scopeStatus: ScopeStatus): string {
  const versionInfo = scopeStatus.version
    ? ` (v${scopeStatus.version})`
    : " (version unknown)";
  const modeInfo = scopeStatus.mode ? ` [mode: ${scopeStatus.mode}]` : "";
  const entryInfo =
    scopeStatus.entry !== null
      ? ` [entry: ${scopeStatus.entry} @ ${scopeStatus.configPath ?? "unknown config"}]`
      : "";
  const pluginInfo = scopeStatus.pluginInConfig ? " [plugin in config]" : "";
  return `${label}: installed${versionInfo}${modeInfo}${entryInfo}${pluginInfo}`;
}
