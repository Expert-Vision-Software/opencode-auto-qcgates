# Changelog

All notable changes to `opencode-auto-qcgates` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-09-08

### Added
- **Scope-aware load-time asset management** — The `config` hook restores the OpenCode plugin default of ensuring its own skill/command assets, now scope-aware: a globally-registered plugin manages the global config dir only; a repo-registered plugin (via `.opencode/opencode.json` **or a repo-root `opencode.json`**) manages only that repo; registered in both, both are ensured — each written strictly inside its own config base. Detection is by semantic, `@latest`-aware registration matching (`name` ≡ `name@latest` ≡ `name@x.y.z`), strictly read-only.
- **One-shot install advisory** — When nothing is registered and nothing is installed in any scope, the load path emits a single non-blocking advisory per session: a warn-level `client.app.log` entry plus a TUI warning toast pointing at `bunx opencode-auto-qcgates install --scope global`. Suppressed whenever any scope holds an install; performs zero writes.

### Changed
- **Manifest-gated "if necessary" installs at load** — The load path shares the CLI's manifest gating: steady state (manifest present, package version matches the manifest-captured version, per-file sha256 hashes match) is a zero-write no-op; version drift or a missing manifest updates only the detected scope and rewrites its manifest; consumer-modified files are skipped with a warning (force stays CLI-only). The hook still never edits `plugin` arrays, never migrates root configs, and never writes outside its detected scope; all 1.4.0 hardening (unparseable-config refusal, canonical `name@latest` references, semantic dedup, CLI-only migration with consent) is unchanged.
- **Regression contract expanded** — The approved scenario table (fresh repo / root `opencode.json` / valid local config / unparseable local config / up-to-date control, each × global vs repo-local context, plus both-scopes, version-drift, and steady-state no-op cases, and the advisory one-shot/suppression behavior) is covered end-to-end in `bun test`, with global-context scenarios writing only into a sandboxed `XDG_CONFIG_HOME`.

## [1.4.0] - 2026-09-07

### Added
- **Per-package sha256 install manifest** — Installs are now gated by `<name>.manifest.json` at the root of the effective opencode config dir (global `~/.config/opencode/` or local `<repo>/.opencode/`), recording the package version plus a per-file sha256 of every installed file. Same version with unchanged hashes is a no-op; consumer-modified files are skipped unless `--force`; a version drift upgrades the install. Replaces the per-skill `.version` markers (stale markers are removed on the first manifest-era install; `status` reads the manifest with a legacy-marker fallback; `uninstall` removes the manifest).
- **Regression tests for the install contract** — The repro-harness scenarios (fresh repo, root `opencode.json`, valid local config, invalid local JSON, up-to-date control) are ported into `bun test` and assert the config hook produces zero disk writes. Installer tests cover refusal to rewrite unparseable JSON, canonical `name@latest` plugin references with semantic dedup, root-config migration guarding, and manifest no-op / drift / `--force` behavior.

### Changed
- **Plugin load is purely in-memory** — The `config` hook no longer installs anything and never writes to disk: it sets task-skill permissions and merges existing local config overrides in memory only. A globally-installed plugin is no longer shadowed by an auto-created stale local copy (previously the hook ran a local install on every opencode start, forced anew each time by `.version` marker drift).
- **Installer hardening** — The installer refuses to rewrite an unparseable `opencode.json`: parse errors abort with a warning and the file is preserved byte-for-byte instead of being rewritten from an empty object. Installer-written plugin references are canonically `name@latest` and deduplicated semantically (`name` ≡ `name@latest` ≡ `name@x.y.z`). Root-config migration is CLI-only via an explicit option, and is refused when either config is unparseable. The CLI verifies it runs from a package with assets present, never a partial cache artifact.

## [1.3.0] - 2026-08-16

### Added
- **Cross-agent install model** — Skill bodies are now agent-agnostic so the plugin works under any dot-agents-compatible agent (Claude Code, OpenCode, etc.). OpenCode-specific bindings (slash-command frontmatter, `agent.task.permission.skill` allowlist, install layout) are layered on top and labelled as such; other agents ignore them.
- **`/test-baseline init` grilling flow** — The `init` subcommand is now a 5-step procedure: classify the consumer (code vs non-code), discover tiers, tailor `testing-protocol.md`, adapt `testing-baseline.xml` to the tier structure, then capture the first baseline. The shipped templates are starting points, not the protocol.
- **Non-code consumer support** — Repos of documents, configs, or data are first-class. The protocol's tiers become document classes or verification passes; "tests" become deterministic checks (linters, validators, count rules). The Build stage becomes `validate`.
- **Hardened file-location rules** — Skills now locate `testing-protocol.md` and `testing-baseline.xml` deterministically: project root (the working-tree root of whatever VCS the consumer uses; see `refs/source-controls.md`) → cwd → stop-and-ask. Never invent a path; warn when found in a non-root location.
- **Tiers are no longer assumed** — The skill explicitly states "never assume backend = dotnet, frontend = npm"; the protocol is the single source of truth.
- **`refs/` reference assets under `assets/skills/test-baselining/`** — three new files consulted during guided flows:
  - `refs/source-controls.md` — VCS-agnostic lookup table (root markers + "has changes?" commands) for Git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS** (Unity Version Control / Plastic SCM), Perforce, Bazaar, Darcs. Always-relevant: consulted during `init`, `Locating the Consumer Files`, and `regression-checking` Caching Logic. The lookup table is the source of truth for the per-VCS "has changes?" probe and the cache-key stable hash.
  - `refs/backends-ref.md` — backend-toolchain map and ten-question grill order (C#, JVM, Go, Rust, Python, Node, Elixir, Erlang, Haskell, Scala, C++). **Init-only** — once the consumer's `testing-protocol.md` is written, this file has no bearing.
  - `refs/frontend-refs.md` — frontend-stack map and ten-question grill order (React, Vue, Svelte, Angular, Solid, **Aurelia 2**, Lit, Ember, HTMX, …). **Init-only**, same authority rule as `backends-ref.md`.
- **Aurelia detection in the installer** — `src/installer.ts#detectAurelia` reads `package.json` for `aurelia` / `aureliajs` / `@aurelia/*` / `aurelia-bootstrapper` / `aurelia-framework` across `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`. On hit, appends a non-blocking recommendation to `InstallResult.recommendations` naming the OpenCode plugin path (`"aurelia-expert"` in `opencode.json`) and the cross-agent `npx skills add` fallback. The installer never modifies the consumer config autonomously. The interface is `{detected: boolean, message: string}`; `AURELIA_PACKAGE_PATTERNS` and `DEP_GROUPS` are named constants, and `printRecommendations` lives in `installer.ts` so both `commands/install.ts` and `plugin.ts` share one helper.
- **Build-artifact capture hardened** — Stage 1 of `test-baselining` now *mandates* artefact metrics per tier (`BuildTime`, `OutputDirectory`, `FileCount`, `TotalSizeMB`, per-critical-file `SizeKB` + `SizeGzippedKB`, and `LintWarnings` by category). `eval` and `update` steps explicitly require artefact metrics; an `update` that drops artefact fields is invalid. The eval output surfaces artefact deltas alongside test deltas — never buried under them.
- **`Reference Asset` and `Installer Recommendation` glossary terms** in `CONTEXT.md`.
- **Tests** — `detectAurelia` coverage: missing `package.json`, non-Aurelia package, `aurelia` in `dependencies`, `@aurelia/runtime` in `devDependencies`, `peerDependencies` branch, `optionalDependencies` branch, defensive `aureliajs` literal, message routing (only the two install paths the spec asked for; no `bunx`/`npx aurelia-expert install` lines), message wording test (no `framework-agnostic`; includes `VCS-agnostic` and `language agnostic`).

### Changed
- `test-baselining` SKILL.md rewritten: agent-agnostic body, `Locating the Consumer Files` section, five-step `init` flow, `## OpenCode` tail section.
- `regression-checking` SKILL.md rewritten: agent-agnostic body, file-location reference points back at `test-baselining`, `## OpenCode` tail section.
- Both slash commands (`/test-baseline`, `/regression-check`) preserve OpenCode-specific frontmatter (`agent: task`, `subtask: true`) but bodies work under any dot-agents loader.
- `AGENTS.md` Architecture section now documents the install model (dot-agents universal + OpenCode-extras); consumer-files section emphasises tier-tailoring and the location rule.
- Threshold matrix in `test-baselining` SKILL.md is now explicitly labelled "defaults — protocol overrides".
- `test-baselining` SKILL.md — `Locating the Consumer Files` is now VCS-agnostic (points at `refs/source-controls.md`); `init` Step 2 directs the agent to `refs/` *before* grilling; `eval` / `update` / `Baseline XML Structure` / `Output Format` all require build-artifact fields; artefact-rule "Hard rule" is tightened so every eval must capture the field set, and a baseline update that drops any field is invalid.
- `regression-checking` SKILL.md — `Execution Flow` and `Caching Logic` rewritten to use VCS-agnostic wording, with a pointer at `test-baselining`'s `refs/source-controls.md` for the per-VCS "has changes?" command.
- `templates/testing-protocol.md` — `Build` stage explicitly lists the mandatory artefact capture list; `Test_Backend` and `Test_Frontend` re-record artefacts when the test command alters the output directory.
- `templates/testing-baseline.xml` — `<Build>` (backend) gains `<CriticalFiles>`; `<BuildArtifacts>` (frontend) gains `Status`, `FileCount`, `LintWarnings`, `LintWarningsByCategory` (generic categories — `Style`, `Correctness`, `Dependency`, `TypeSafety`, `Other`), and three canonical `<KeyFiles>` slots (entry chunk, CSS bundle, html). Indent normalised for `<Build>` and `<BuildArtifacts>` opening tags.
- `AGENTS.md` — Asset-structure diagram gains the `refs/` row; Key Conventions gain the `refs/` policy, VCS-agnostic body rule, build-artifact capture rule, and the installer-recommendation non-blocking rule. The file-location rule ("project root → cwd → stop-and-ask") is now VCS-agnostic and points at `refs/source-controls.md`.
- `README.md` — Architecture section now lists tiers, source-control coverage, backend / frontend toolchain coverage, build-artifact capture, and Aurelia detection.
- `docs/agents/domain.md` — `Authoring rules` carry the new `refs/` policy, build-artifact rule, VCS-agnostic rule, and the backend/frontend-language-agnostic rule. File-location rule pointer points at the `refs/` source-controls table instead of `.git/`.

### Fixed
- `tests/plugin.test.ts` assertion updated to match the new `# Test Baselining` skill title.
- **Code-review pass** tightened `detectAurelia`: dropped the speculative `evidences: string[]` field on the public `AureliaRecommendation` interface (the field was never surfaced via `InstallResult`); replaced `keyof Record<string, unknown>` (which collapses to `string`) with a plain `string[]`; lifted the Aurelia-name patterns to a named `AURELIA_PACKAGE_PATTERNS` constant. The recommendation message is trimmed to the two install paths the spec requested (OpenCode plugin + `npx skills add`) and the wording now reads "VCS-agnostic and backend/frontend-language agnostic" (not "framework-agnostic"). `printRecommendations` is exported from `src/installer.ts` and used by both `src/commands/install.ts` and `plugin.ts`; the inline loop duplicate is gone.
- `<LintWarningsByCategory>` in `templates/testing-baseline.xml` no longer hardcodes React-specific category names (`ReactHooks`, `NoExplicitAny`, etc.); replaced with framework-agnostic generic categories.
- Indent drift in `templates/testing-baseline.xml` (`<Build>` / `<BuildArtifacts>` opening tags) and `templates/testing-protocol.md` (new build-artifact bullets) corrected to match the file's existing pattern.
- `.opencode/skills/` and `.opencode/commands/` are now gitignored. They are a derived install cache, not source-of-truth — the canonical files live at `assets/skills/` and `assets/commands/`. The only tracked file under `.opencode/` remains `opencode.json` (the dev's OpenCode config).

## [1.3.1] - 2026-09-06

### Changed
- `/test-baseline` command frontmatter sets `subtask: false` — the command now runs in the main conversation instead of spawning a task subagent, so grilling-style interaction with the user works during `init`.

### Fixed
- `test-baselining` SKILL.md grilling-flow probe path placeholder renamed `<configBase>` → `<base>` to match the terminology used elsewhere in the skill.
- Dev `.opencode/opencode.json` plugin reference switched from a machine-specific absolute `file:///` path to the package name `opencode-architect`, making the dev config portable.

## [1.2.0] - 2026-08-16

### Added
- **Global plugin overridable at local project** — Local `.opencode/opencode.json` can now override global plugin settings. When both global and local are installed, the local version takes priority. Added `ScopeResolver` class for cleaner scope detection and `mergeConfigWithOverrides()` to apply local config overrides (excluding `plugin` and `agent` keys which are managed separately).
- GitHub Actions release workflow (`.github/workflows/release.yml`) — Two-job pipeline: GitHub Release (notes extracted from `CHANGELOG.md`) + `npm publish --provenance --access public`.

### Changed
- `package.json` now includes `sideEffects: false`, `engines: { bun: ">=1.0.0" }`, and `prepublishOnly: "bun run check && bun test"` scripts for better npm publishing hygiene.

### Fixed
- **Skill permissions for task agent** — The `task` agent now has permission to access `test-baselining` and `regression-checking` skills, fixing the issue where commands leveraging skills with subagents couldn't find the skill.
- **Append-only changelog entries** — Added instruction in `test-baselining` skill to ensure existing `<entry>` items in `testing-baseline.xml` are never modified, only new entries appended.

## [1.1.0] - 2026-07-20

### Added
- Initial public release with `test-baselining` and `regression-checking` skills.
- Two-command system: `/test-baseline` and `/regression-check`.
- Threshold-based quality gates with decision signals for autonomous agents.
- Baseline file discovery and management.
- Support for backend and frontend test layers.
- `testing-baseline.xml` and `testing-protocol.md` consumer project files.
