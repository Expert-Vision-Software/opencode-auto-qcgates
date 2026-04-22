#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { installCommand } from "./commands/install.ts";
import { uninstallCommand } from "./commands/uninstall.ts";
import { statusCommand } from "./commands/status.ts";
import type { Scope } from "./installer.ts";

const pkg = JSON.parse(
  await Bun.file(`${import.meta.dirname}/../package.json`).text()
);
const VERSION = pkg.version;
const PACKAGE_NAME = pkg.name;

function printHelp(): void {
  console.log(`
${PACKAGE_NAME} v${VERSION}

Commands:
  install     Install the skills, commands, and agents
  uninstall   Remove the skills, commands, and agents
  status      Check installation status

Options:
  -s, --scope <scope>    Installation scope: "local" or "global"
  -f, --force           Skip confirmation prompts
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  ${PACKAGE_NAME} install
  ${PACKAGE_NAME} install --scope global
  ${PACKAGE_NAME} uninstall --scope local
  ${PACKAGE_NAME} status
`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    options: {
      scope: {
        type: "string",
        short: "s",
      },
      force: {
        type: "boolean",
        short: "f",
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

  if (scope && scope !== "local" && scope !== "global") {
    console.error(`Invalid scope: ${scope}. Must be "local" or "global".`);
    process.exit(1);
  }

  try {
    switch (command) {
      case "install":
        await installCommand({ scope, force });
        break;
      case "uninstall":
        await uninstallCommand({ scope, force });
        break;
      case "status":
        await statusCommand();
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