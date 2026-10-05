#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { installCommand } from "./commands/install.ts";
import { uninstallCommand } from "./commands/uninstall.ts";
import { statusCommand } from "./commands/status.ts";
import { CacheCleaner } from "./cache-cleaner.ts";
import { ClearCacheUsageError } from "./clear-cache-usage-error.ts";
import type { InstallMode, Scope } from "./installer.ts";

const pkg = JSON.parse(
  await Bun.file(`${import.meta.dirname}/../package.json`).text()
);
const VERSION = pkg.version;
const PACKAGE_NAME = pkg.name;

function printHelp(): void {
  console.log(`
${PACKAGE_NAME} v${VERSION}

Commands:
  install      Install the skills, commands, and agents
  uninstall    Remove the skills, commands, and agents
  status       Check installation status
  clear-cache  Remove this package's cached copies from OpenCode's package cache

Options:
  -s, --scope <scope>    Installation scope: "local" or "global"
  -m, --mode <mode>      Install mode: "plugin" or "copy"
  -f, --force            Skip confirmation prompts
      --migrate          Consent to move a repo-root opencode.json into .opencode/
  -h, --help             Show this help message
  -v, --version          Show version

Examples:
  ${PACKAGE_NAME} install
  ${PACKAGE_NAME} install --scope global
  ${PACKAGE_NAME} install --mode plugin
  ${PACKAGE_NAME} install --scope local --migrate
  ${PACKAGE_NAME} uninstall --scope local
  ${PACKAGE_NAME} status
  ${PACKAGE_NAME} clear-cache
`);
}

function isInstallMode(value: string): value is InstallMode {
  return value === "copy" || value === "plugin";
}

function parseMode(value: string | undefined): InstallMode | null {
  if (value === undefined) {
    return null;
  }
  if (isInstallMode(value)) {
    return value;
  }
  console.error(`Invalid mode: ${value}. Must be "copy" or "plugin".`);
  process.exit(1);
}

async function clearCacheCommand(): Promise<void> {
  const cleaner = new CacheCleaner();
  const outcome = await cleaner.clearPackageCache(PACKAGE_NAME);
  if (outcome.removed.length === 0) {
    console.log("No cached copies found; nothing to remove.");
  } else {
    console.log("Removed cached copies:");
    for (const target of outcome.removed) {
      console.log(`  Removed: ${target}`);
    }
  }
  for (const warning of outcome.warnings) {
    console.warn(`  Warning: ${warning}`);
  }
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    options: {
      scope: {
        type: "string",
        short: "s",
      },
      mode: {
        type: "string",
        short: "m",
      },
      force: {
        type: "boolean",
        short: "f",
        default: false,
      },
      migrate: {
        type: "boolean",
        default: false,
      },
      package: {
        type: "string",
      },
      all: {
        type: "boolean",
        default: false,
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
      version: {
        type: "boolean",
        short: "v",
        default: false,
      },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.version) {
    console.log(`${PACKAGE_NAME} v${VERSION}`);
    process.exit(0);
  }

  if (values.help || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = positionals[0];
  const scope: Scope | undefined = values.scope as Scope | undefined;
  const force: boolean = values.force;
  const migrate: boolean = values.migrate;

  if (scope && scope !== "local" && scope !== "global") {
    console.error(`Invalid scope: ${scope}. Must be "local" or "global".`);
    process.exit(1);
  }

  const mode: InstallMode | null = parseMode(values.mode);

  try {
    switch (command) {
      case "install":
        await installCommand({ scope: scope ?? null, force, mode, migrate });
        break;
      case "uninstall":
        await uninstallCommand({ scope, force });
        break;
      case "status":
        await statusCommand();
        break;
      case "clear-cache":
        if (values.package !== undefined || values.all || positionals.length > 1) {
          throw new ClearCacheUsageError(
            "clear-cache is self-only: it removes only this package's own cached copies. " +
              "It accepts no --package or --all option and no extra arguments."
          );
        }
        await clearCacheCommand();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
