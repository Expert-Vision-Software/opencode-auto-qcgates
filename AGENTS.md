# opencode-auto-qcgates

OpenCode plugin for automated quality gate evaluation via test baselining.

## Commands

| Command | Description |
|---------|-------------|
| `/test-baseline eval` | Evaluate tests against baseline (DEFAULT) |
| `/test-baseline init` | Create new baseline |
| `/test-baseline update` | Update baseline if PASS and thresholds exceeded |

## Developer Commands

```bash
bun run check   # TypeScript type check
bun test       # Run unit tests
```

## Architecture

- `plugin.ts` — Plugin entry point; copies skill/command assets to `.opencode/` on first load
- `src/installer.ts` — Asset installation logic (copies `assets/skills/test-baselining/` and `assets/commands/test-baseline.md`)
- `assets/skills/test-baselining/SKILL.md` — Skill definition
- `assets/commands/test-baseline.md` — Command definition

## Installation

In `.opencode/opencode.json`:

```json
{ "plugin": ["expert-vision-software/opencode-auto-qcgates"] }
```

## Baseline Storage

Baseline metrics stored in `@testing-baseline.xml` at project root.
