# Changelog

All notable changes to `opencode-auto-qcgates` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-08-16

### Added
- **`refs/` reference assets under `assets/skills/test-baselining/`** — three new files consult during guided flows:
  - `refs/source-controls.md` — VCS-agnostic lookup table (root markers + "has changes?" commands) for Git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS** (Unity Version Control / Plastic SCM), Perforce, Bazaar, Darcs. Always-relevant: consulted during `init`, `Locating the Consumer Files`, and `regression-checking` Caching Logic.
  - `refs/backends-ref.md` — backend-toolchain map and ten-question grill order (C#, JVM, Go, Rust, Python, Node, Elixir, Erlang, Haskell, Scala, C++). **Init-only** — once the consumer's `testing-protocol.md` is written, this file has no bearing.
  - `refs/frontend-refs.md` — frontend-stack map and ten-question grill order (React, Vue, Svelte, Angular, Solid, **Aurelia 2**, Lit, Ember, HTMX, …). **Init-only**, same authority rule as `backends-ref.md`.
- **Aurelia detection in the installer** — `src/installer.ts#detectAurelia` reads `package.json` for `aurelia` / `@aurelia/*` deps (across `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) and, on hit, appends a non-blocking recommendation to `InstallResult.recommendations`. The recommendation names the OpenCode plugin path (`"aurelia-expert"` in `opencode.json`) and the cross-agent `npx skills add` fallback. The installer never modifies the consumer config autonomously.
- **Build-artifact capture hardened** — Stage 1 of `test-baselining` now *mandates* catching artefact metrics per tier (`BuildTime`, `OutputDirectory`, `FileCount`, `TotalSizeMB`, per-critical-file `SizeKB` + `SizeGzippedKB`, and `LintWarnings` by category). `eval` and `update` steps explicitly require artefact metrics; an `update` that drops artefact fields is invalid. The eval output surfaces artefact deltas alongside test deltas — never buried under them.
- **`reference` and `installer recommendation` glossary terms** in `CONTEXT.md`.
- **Tests** — `detectAurelia` coverage: missing `package.json`, non-Aurelia package, `aurelia` in `dependencies`, `@aurelia/runtime` in `devDependencies`, message routing (OpenCode + `npx skills add` paths).

### Changed
- `test-baselining` SKILL.md — `Locating the Consumer Files` is now VCS-agnostic (points at `refs/source-controls.md`); `init` Step 2 directs the agent to `refs/` *before* grilling; `eval` / `update` / `Baseline XML Structure` / `Output Format` all require build-artifact fields.
- `regression-checking` SKILL.md — `Execution Flow` and `Caching Logic` rewritten to use VCS-agnostic wording, with a pointer at `test-baselining`'s `refs/source-controls.md` for the per-VCS "has changes?" command.
- `templates/testing-protocol.md` — `Build` stage explicitly lists the mandatory artefact capture list; `Test_Backend` and `Test_Frontend` re-record artefacts when the test command alters the output directory.
- `templates/testing-baseline.xml` — `<Build>` (backend) gains `<CriticalFiles>`; `<BuildArtifacts>` (frontend) gains `Status`, `FileCount`, `LintWarnings`, `LintWarningsByCategory`, and three canonical `<KeyFiles>` slots (entry chunk, CSS bundle, html).
- `AGENTS.md` — Asset-structure diagram gains the `refs/` row; Key Conventions gain the `refs/` policy, VCS-agnostic body rule, build-artifact capture rule, and the installer-recommendation non-blocking rule.
- `README.md` — Architecture section now lists tiers, source-control coverage, backend / frontend toolchain coverage, build-artifact capture, and Aurelia detection.

## [1.3.0] - 2026-08-16

### Added
- **Cross-agent install model** — Skill bodies are now agent-agnostic so the plugin works under any dot-agents-compatible agent (Claude Code, OpenCode, etc.). OpenCode-specific bindings (slash-command frontmatter, `agent.explore.permission.skill` allowlist, install layout) are layered on top and labelled as such; other agents ignore them.
- **`/test-baseline init` grilling flow** — The `init` subcommand is now a 5-step procedure: classify the consumer (code vs non-code), discover tiers, tailor `testing-protocol.md`, adapt `testing-baseline.xml` to the tier structure, then capture the first baseline. The shipped templates are starting points, not the protocol.
- **Non-code consumer support** — Repos of documents, configs, or data are first-class. The protocol's tiers become document classes or verification passes; "tests" become deterministic checks (linters, validators, count rules). The Build stage becomes `validate`.
- **Hardened file-location rules** — Skills now locate `testing-protocol.md` and `testing-baseline.xml` deterministically: project root (the directory containing `.git/`) → cwd → stop-and-ask. Never invent a path; warn when found in a non-root location.
- **Tiers are no longer assumed** — The skill explicitly states "never assume backend = dotnet, frontend = npm"; the protocol is the single source of truth.

### Changed
- `test-baselining` SKILL.md rewritten: agent-agnostic body, `Locating the Consumer Files` section, five-step `init` flow, `## OpenCode` tail section.
- `regression-checking` SKILL.md rewritten: agent-agnostic body, file-location reference points back at `test-baselining`, `## OpenCode` tail section.
- Both slash commands (`/test-baseline`, `/regression-check`) preserve OpenCode-specific frontmatter (`agent: explore`, `subtask: true`) but bodies work under any dot-agents loader.
- `AGENTS.md` Architecture section now documents the install model (dot-agents universal + OpenCode-extras); consumer-files section emphasises tier-tailoring and the location rule.
- Threshold matrix in `test-baselining` SKILL.md is now explicitly labelled "defaults — protocol overrides".

### Fixed
- `tests/plugin.test.ts` assertion updated to match the new `# Test Baselining` skill title.

## [1.2.0] - 2026-08-16

### Added
- **Global plugin overridable at local project** — Local `.opencode/opencode.json` can now override global plugin settings. When both global and local are installed, the local version takes priority. Added `ScopeResolver` class for cleaner scope detection and `mergeConfigWithOverrides()` to apply local config overrides (excluding `plugin` and `agent` keys which are managed separately).
- GitHub Actions release workflow (`.github/workflows/release.yml`) — Two-job pipeline: GitHub Release (notes extracted from `CHANGELOG.md`) + `npm publish --provenance --access public`.

### Changed
- `package.json` now includes `sideEffects: false`, `engines: { bun: ">=1.0.0" }`, and `prepublishOnly: "bun run check && bun test"` scripts for better npm publishing hygiene.

### Fixed
- **Skill permissions for explore subagent** — The `explore` subagent now has permission to access `test-baselining` and `regression-checking` skills, fixing the issue where commands leveraging skills with subagents couldn't find the skill.
- **Append-only changelog entries** — Added instruction in `test-baselining` skill to ensure existing `<entry>` items in `testing-baseline.xml` are never modified, only new entries appended.

## [1.1.0] - 2026-07-20

### Added
- Initial public release with `test-baselining` and `regression-checking` skills.
- Two-command system: `/test-baseline` and `/regression-check`.
- Threshold-based quality gates with decision signals for autonomous agents.
- Baseline file discovery and management.
- Support for backend and frontend test layers.
- `testing-baseline.xml` and `testing-protocol.md` consumer project files.
