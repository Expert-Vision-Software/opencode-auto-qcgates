# Changelog

All notable changes to `opencode-auto-qcgates` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
