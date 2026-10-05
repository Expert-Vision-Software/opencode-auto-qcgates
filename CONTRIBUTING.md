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
bunx . install --scope local --migrate
bunx . status
bunx . clear-cache
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
├── commands/
│   ├── test-baseline.md
│   └── regression-check.md
├── manifest.json             # Optional-dependencies declaration
├── skills/
│   ├── test-baselining/
│   │   ├── SKILL.md
│   │   └── templates/
│   │       ├── testing-baseline.xml
│   │       └── testing-protocol.md
│   └── regression-checking/
│       └── SKILL.md
├── src/
│   ├── cli.ts                # CLI entry: install / uninstall / status / clear-cache
│   ├── commands/
│   │   ├── install.ts
│   │   ├── uninstall.ts
│   │   └── status.ts
│   ├── installer.ts          # install/uninstall/status, manifest-gated copies
│   ├── manifest.ts           # InstallManifest: version + per-file sha256 hashes
│   ├── optional-deps.ts      # bundled optional-dependency manifest + merge
│   ├── plugin-name.ts        # @latest-aware plugin name normalize/match
│   ├── prompts.ts            # Interactive prompts
│   └── registration.ts       # read-only, config-based scope detection
├── tests/
│   └── plugin.test.ts
├── .gitignore
├── AGENTS.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── index.ts                  # module entry: re-exports src/plugin.ts
├── package.json
├── src/plugin.ts             # plugin entry with config hook (auto-install on load)
└── tsconfig.json
```

The `src/` list above is not exhaustive — additional modules may appear as the install, config-write, and cache surfaces grow.

## Architecture

### Install command

`bunx opencode-auto-qcgates install` copies skill files to the target `.opencode/` directory and registers the package in `opencode.json`:

- **Local** (default): copies to `{project}/.opencode/skills/` and updates `{project}/.opencode/opencode.json`.
- **Global**: copies to `~/.config/opencode/skills/` and updates `~/.config/opencode/opencode.json`.

It also pre-grants `permission.skill: "allow"` for `test-baselining` and `regression-checking` skills and writes `<package>.manifest.json` — the installed version plus per-file sha256 hashes — to skip re-install on subsequent loads.

### Plugin auto-install

When OpenCode loads the package via the `opencode.json` `plugin` array, `src/plugin.ts` detects the registration scope and installs only into scopes that already reference the package — so the package auto-installs skills on first use if not already installed.

### Scope detection

Registration scope is detected read-only from config, never from directory identity. `RegistrationDetector.detect(directory)` in `src/registration.ts` inspects:

- the global config base (`$XDG_CONFIG_HOME/opencode`, falling back to `~/.config/opencode`), and
- the repo's own configs: `<directory>/.opencode/` and the repo root `<directory>/`.

Each base is probed for both `opencode.json` and `opencode.jsonc` through `isPluginInConfigBase()`. Plugin entries are compared with `PluginNameNormalizer.matches()`, so `name`, `name@latest`, and `name@x.y.z` count as the same package. The launch `directory` is used only to locate the repo's own configs; it is never compared against the plugin's own location (`import.meta.dirname`, `process.cwd()`, or a realpath of either) — there is no directory-identity check.

### Local overrides

When a local installation exists alongside a global one, the local configuration takes priority. The `mergeConfigWithOverrides()` function merges local config into the input, excluding `plugin` and `agent` keys (which are managed separately by the installer).

## Coding rules

1. **No comments in TypeScript.** Use descriptive method/variable names instead.
2. **Functions over classes where practical.** Keep logic modular and testable.
3. **Nullable over optional** in interfaces — `value: string | null`, never `value?: string`.
4. **Skill frontmatter is the source of truth.** Do not edit `skills/*/SKILL.md` frontmatter in ways that break the `name` / `description` contract.
5. **Only add code under `src/`** that supports the install/uninstall/status surface. This is a skill-bundling package, not a runtime library.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Skill not in `<available_skills>` list | Not installed yet | Run `bunx opencode-auto-qcgates install` |
| Skill not accessible to task agent | Permission not granted | Run install again to refresh permissions |
| Local install not overriding global | Version mismatch | Ensure local and global are same version |
| `bunx opencode-auto-qcgates` not found | Bun missing or package not in PATH | Install Bun from `bun.sh`; try `npx opencode-auto-qcgates install` as fallback |
