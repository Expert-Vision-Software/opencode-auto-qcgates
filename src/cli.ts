#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { select } from "@inquirer/prompts";
import { installCommand } from "./commands/install.ts";
import { uninstallCommand } from "./commands/uninstall.ts";
import { statusCommand } from "./commands/status.ts";
import { manageDepsCommand } from "./commands/manage-deps.ts";
import { isInteractiveStdio } from "./prompts.ts";
import type { Scope } from "./installer.ts";

const pkg = JSON.parse(
  await Bun.file(`${import.meta.dirname}/../package.json`).text()
);
const VERSION = pkg.version;
const PACKAGE_NAME = pkg.name;

function printHelp(): void {
  console.log(`
${PACKAGE_NAME} v${VERSION}

Usage: ${PACKAGE_NAME} [command]

Commands:
  install       Install the skills, commands, and agents
  uninstall     Remove the skills, commands, and agents
  status        Check installation status
  manage-deps   Review optional dependencies (accept or decline)

Run without arguments in a terminal to open an interactive menu.

Options:
  -s, --scope <scope>    Installation scope: "local" or "global"
  -f, --force           Skip confirmation prompts
  -h, --help            Show this help message
  -v, --version         Show version

Examples:
  ${PACKAGE_NAME}
  ${PACKAGE_NAME} install
  ${PACKAGE_NAME} install --scope global
  ${PACKAGE_NAME} uninstall --scope local
  ${PACKAGE_NAME} manage-deps --scope local
  ${PACKAGE_NAME} status
`);
}

type MenuAction = "install" | "uninstall" | "status" | "manage-deps" | "exit";

async function interactiveMenu(): Promise<void> {
  for (;;) {
    const action = await select<MenuAction>({
      message: `${PACKAGE_NAME} v${VERSION} — what do you want to do?`,
      choices: [
        { name: "Install", value: "install" },
        { name: "Uninstall", value: "uninstall" },
        { name: "Status", value: "status" },
        { name: "Manage optional dependencies", value: "manage-deps" },
        { name: "Exit", value: "exit" },
      ],
    });

    switch (action) {
      case "install":
        await installCommand({});
        break;
      case "uninstall":
        await uninstallCommand({});
        break;
      case "status":
        await statusCommand();
        break;
      case "manage-deps":
        await manageDepsCommand({});
        break;
      case "exit":
        return;
    }

    console.log("");
  }
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

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (positionals.length === 0) {
    if (!isInteractiveStdio()) {
      printHelp();
      process.exit(0);
    }
    try {
      await interactiveMenu();
    } catch (error) {
      if (error instanceof Error && error.name === "ExitPromptError") {
        process.exit(0);
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
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
      case "manage-deps":
        await manageDepsCommand({ scope });
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