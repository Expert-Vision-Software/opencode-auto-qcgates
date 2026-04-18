#!/usr/bin/env bun
/**
 * opencode-auto-qcgates CLI
 * Install: bunx opencode-auto-qcgates install
 */
import { execSync } from "child_process";

const command = process.argv[2] ?? "install";

switch (command) {
  case "install":
    execSync("opencode plugin add file://" + process.cwd(), { stdio: "inherit" });
    break;
  default:
    console.log("Usage: opencode-auto-qcgates [install]");
}
