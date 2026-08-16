# Contributing to opencode-auto-qcgates

Thanks for your interest in contributing! This guide covers the technical internals, development setup, and architecture.

## Development setup

### Prerequisites

- [Bun](https://bun.sh) `>=1.0.0` — required for the CLI installer, test suite, and OpenCode plugin runtime.

### Install dependencies

```bash
bun install
```

### Run the test suite

```bash
bun test
```

### Type-check

```bash
bun run check
```

Runs `tsc --noEmit` against `*.ts`, `src/**/*.ts`, and `tests/**/*.ts`.

### Smoke-test the CLI

```bash
bunx . install --scope local
bunx . status
bunx . uninstall --scope local
```

## File layout

```
opencode-auto-qcgates/
├── .github/
│   └── workflows/
│       └── release.yml       # CI: GitHub Release + npm publish --provenance
├── .opencode/
│   └── opencode.json         # self-config for development
├── assets/
│   ├── commands/
│   │   ├── test-baseline.md
│   │   └── regression-check.md
│   └── skills/
│       ├── test-baselining/
│       │   ├── SKILL.md
│       │   └── templates/
│       │       ├── testing-baseline.xml
│       │       └── testing-protocol.md
│       └── regression-checking/
│           └── SKILL.md
├── src/
│   ├── cli.ts                # CLI entry: install / uninstall / status
│   ├── commands/
│   │   ├── install.ts
│   │   ├── uninstall.ts
│   │   └── status.ts
│   ├── installer.ts          # install/uninstall/status with ScopeResolver
│   └── prompts.ts           # Interactive prompts
├── tests/
│   └── plugin.test.ts
├── .gitignore
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── index.ts                  # module entry: re-exports plugin.ts
├── package.json
├── plugin.ts                 # plugin entry with config hook (auto-install on load)
└── tsconfig.json
```

## Architecture

### Install command

`bunx opencode-auto-qcgates install` copies skill files to the target `.opencode/` directory and registers the package in `opencode.json`:

- **Local** (default): copies to `{project}/.opencode/skills/` and updates `{project}/.opencode/opencode.json`.
- **Global**: copies to `~/.config/opencode/skills/` and updates `~/.config/opencode/opencode.json`.

It also pre-grants `permission.skill: "allow"` for `test-baselining` and `regression-checking` skills and writes a `.version` marker to skip re-install on subsequent loads.

### Plugin auto-install

When OpenCode loads the package via `opencode.json` plugins array, `plugin.ts` runs the same (local) install logic with a version-marker check — so the package auto-installs skills on first use if not already installed. The check uses `ScopeResolver.resolve(directory, globalConfigPath)` so the plugin auto-installs at the correct scope.

### Scope resolution

The `ScopeResolver` class determines whether installation should be local (project-specific) or global (user-wide):

```typescript
export class ScopeResolver {
  static resolve(directory: string, globalConfigPath: string): Scope {
    const isExact = directory === globalConfigPath;
    const isUnderForward = directory.startsWith(globalConfigPath + "/");
    const isUnderBack = directory.startsWith(globalConfigPath + "\\");
    if (isExact || isUnderForward || isUnderBack) {
      return "global";
    }
    return "local";
  }
}
```

### Local overrides

When a local installation exists alongside a global one, the local configuration takes priority. The `mergeConfigWithOverrides()` function merges local config into the input, excluding `plugin` and `agent` keys (which are managed separately by the installer).

## Coding rules

1. **No comments in TypeScript.** Use descriptive method/variable names instead.
2. **Functions over classes where practical.** Keep logic modular and testable.
3. **Nullable over optional** in interfaces — `value: string | null`, never `value?: string`.
4. **Skill frontmatter is the source of truth.** Do not edit `assets/skills/*/SKILL.md` frontmatter in ways that break the `name` / `description` contract.
5. **Only add code under `src/`** that supports the install/uninstall/status surface. This is a skill-bundling package, not a runtime library.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Skill not in `<available_skills>` list | Not installed yet | Run `bunx opencode-auto-qcgates install` |
| Skill not accessible to explore subagent | Permission not granted | Run install again to refresh permissions |
| Local install not overriding global | Version mismatch | Ensure local and global are same version |
| `bunx opencode-auto-qcgates` not found | Bun missing or package not in PATH | Install Bun from `bun.sh`; try `npx opencode-auto-qcgates install` as fallback |
