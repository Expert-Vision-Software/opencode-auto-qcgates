# Changelog

All notable changes to `opencode-auto-qcgates` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
