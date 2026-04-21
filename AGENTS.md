# opencode-auto-qcgates

OpenCode plugin for automated quality gate evaluation via test baselining.

## Commands

| Command | Description |
|---------|-------------|
| `/test-baseline eval` | Evaluate tests against baseline (DEFAULT) |
| `/test-baseline init` | Create new baseline |
| `/test-baseline update` | Update baseline if PASS and thresholds exceeded |
| `/regression-check` | Quality regression check (proactive/reactive) |

## Developer Commands

```bash
bun run check   # TypeScript type check
bun test       # Run unit tests
```

## Architecture

- `plugin.ts` — Plugin entry point; copies skill/command assets to `.opencode/` on first load
- `src/installer.ts` — Asset installation logic (copies `assets/skills/` and `assets/commands/`)
- `assets/skills/test-baselining/SKILL.md` — Test execution and baseline management skill
- `assets/skills/regression-checking/SKILL.md` — Quality regression decision support skill
- `assets/commands/test-baseline.md` — Test baselining command
- `assets/commands/regression-check.md` — Regression checking command

## Installation

In `.opencode/opencode.json`:

```json
{ "plugin": ["expert-vision-software/opencode-auto-qcgates"] }
```

## Baseline Storage

After `init`, the following files are created at the project root:

| File | Description |
|------|-------------|
| `testing-protocol.md` | Protocol definition with execution workflow, thresholds, and decision logic |
| `testing-baseline.xml` | Baseline metrics and changelog |
