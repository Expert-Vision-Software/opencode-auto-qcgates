<!--
  SEO description: OpenCode plugin for automated test baselining and quality gate evaluation. Detects regressions, answers "did we break anything?", and provides decision signals for autonomous agents.
  Keywords: OpenCode, testing, baselining, quality gates, regression detection, CI/CD, autonomous agents, AI coding
-->

<div align="center">

# opencode-auto-qcgates

**Automated test baselining and quality gate evaluation for AI coding agents**

[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-blue?link=https://opencode.ai)](https://opencode.ai)
[![npm version](https://img.shields.io/npm/v/opencode-auto-qcgates?label=npm)](https://www.npmjs.com/package/opencode-auto-qcgates)
[![MIT License](https://img.shields.io/badge/License-MIT-green?link=LICENSE)](LICENSE)

[Quick start](#quick-start) · [Commands](#commands) · [Architecture](#architecture) · [Requirements](#requirements) · [Development](#development)

</div>

---

Bring automated **quality gate evaluation** into every AI agent session. This plugin bundles two router-routed skills — `test-baselining` for operational work and `regression-checking` for decision signals — so any compatible agent can run tests, detect regressions, and make commit/release decisions with confidence.

## What it does

- **Test Baselining** — Capture metrics baseline, compare future runs against it, detect regressions before they ship
- **Regression Checking** — Answer "did we break anything?", "should I proceed or stop?", "is it safe to commit?"
- **Quality Gates** — Threshold-based pass/fail with structured decision signals for agents

Works with .NET, Node.js, Python, Java — and any test framework (xUnit, Jest, Vitest, pytest, etc.).

## Quick Start

```bash
# Initialize baseline from current test results
/test-baseline init

# Later, check if you've broken anything
/test-baseline eval

# Ask a quality question
/regression-check "Did we break anything?"
```

## Installation

### Option 1: opencode.json (recommended)

Add to `.opencode/opencode.json` in your project:

```json
{
  "plugin": ["github:expert-vision-software/opencode-auto-qcgates"]
}
```

OpenCode resolves the plugin from npm automatically.

### Option 2: bunx

```bash
bunx opencode-auto-qcgates install
```

## Commands

### `/test-baseline`

Test execution and baseline management.

| Subcommand | Description |
|------------|-------------|
| `eval` | Evaluate current tests against baseline (DEFAULT) |
| `init` | Create new baseline from current test results |
| `update` | Update baseline if PASS and thresholds exceeded |

### `/regression-check`

Quality regression detection — answers questions and provides decision signals for autonomous agents.

```bash
/regression-check                 # Run full regression check
/regression-check "Did we break anything?"   # Answer a specific quality question
```

**Activation triggers:**
- Proactive: After agent task completion, before commit/push
- Reactive: Questions like "should I proceed?", "is it safe to commit?", "did we break anything?"

## How It Works

### Two Skills, One System

**`test-baselining`** handles the operational work:
1. Build backend + frontend
2. Run tests with coverage collection
3. Compare metrics against baseline
4. Apply threshold rules

**`regression-checking`** provides the decision layer:
1. Loads test-baselining results
2. Reads `testing-protocol.md` for thresholds and pass/fail criteria
3. Interprets through risk lens
4. Answers quality questions in plain language
5. Emits structured signals for autonomous agents

### Baseline Files

After `/test-baseline init`, these files are created at your project root:

| File | Purpose |
|------|---------|
| `testing-baseline.xml` | Stores baseline metrics and changelog |
| `testing-protocol.md` | Defines thresholds, pass/fail criteria, workflow |

### Threshold Matrix

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Test count | > 10% change | Any |
| Pass rate | > 10% change | Any |
| Build time | > 10% increase | Up only |
| Coverage | > 5% change | Any |
| Test duration | > 20% increase | Up only |
| Artifact size | > 10% change | Any |

## Decision Signals

When running `/regression-check`, the skill outputs both human-readable narrative and structured agent signals:

```json
{
  "decision": "STOP",
  "status": "FAIL",
  "risk_level": "high",
  "violations": [
    { "metric": "coverage", "current": "78%", "baseline": "82%", "delta": "-4%", "threshold": "5%" }
  ],
  "approval_required": true,
  "next_actions": ["Fix failing tests", "Re-run regression check"]
}
```

| Decision | Trigger | Agent Behavior |
|----------|---------|----------------|
| **PROCEED** | PASS + no violations | Continue to next task or commit |
| **STOP** | FAIL + critical/high violations | Halt, await human approval |
| **REVIEW** | FAIL + medium/low violations | Report and recommend specific fixes |

## Example Output

```
Regression Check: FAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test Results: 147 passed, 3 failed
Coverage: 78% (baseline: 82%) — -4% ▼
Build time: 45s (baseline: 38s) — +18% ▲▲

Threshold Violations:
• Frontend coverage dropped 5% (threshold: 5%) — EXCEEDED
• Build time increased 18% (threshold: 10%) — EXCEEDED

Risk Assessment: HIGH
Test failures and multiple threshold violations detected.

Recommendation: STOP — Fix failures and address coverage drop before proceeding.
Do not commit until status is PASS.
```

## Architecture

The plugin is project-type agnostic:
- Build commands: dotnet, npm, mvn, gradle
- Test frameworks: xUnit, Jest, Vitest, pytest, NUnit
- Coverage tools: Cobertura, v8, coveragepy

See `AGENTS.md` for detailed developer documentation.

## Why this plugin?

- **Zero-overhead when not in use** — Skill metadata loads at startup; full content loads only when the agent decides it's relevant.
- **Project-type agnostic** — Works with .NET, Node.js, Python, Java, and any test framework (xUnit, Jest, Vitest, pytest, NUnit, etc.).
- **Decision signals for autonomous agents** — Structured JSON output (`STOP`, `PROCEED`, `REVIEW`) enables agents to act autonomously or await human approval.
- **Local-first overrides** — Global plugin installable; local projects can override settings without conflicts.
- **Baseline longevity** — Metrics persist across sessions; thresholds prevent noise from minor fluctuations.

## Requirements

| Component | Notes |
|-----------|-------|
| **[Bun](https://bun.sh) ≥ 1.0** | Required for the CLI installer, test suite, and OpenCode plugin runtime. |
| **OpenCode, Claude Code, or any skill-compatible agent** | The skills surface in the agent's `<available_skills>` list once installed. |

## Installation

### 1. CLI install (any agent)

```bash
# Local scope (default): installs to ./.opencode/skills/
bunx opencode-auto-qcgates install

# Global scope: installs to ~/.config/opencode/skills/
bunx opencode-auto-qcgates install --scope global

# Same commands work with npx
npx opencode-auto-qcgates install

# Check / remove
bunx opencode-auto-qcgates status
bunx opencode-auto-qcgates uninstall --scope local
```

Non-interactive by design — no prompts, CI-friendly. The CLI writes a `.version` marker under `skills/test-baselining/` so subsequent runs are no-ops.

### 2. OpenCode plugin auto-install

Add `opencode-auto-qcgates` to your `.opencode/opencode.json` `plugin` array:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-auto-qcgates"]
}
```

OpenCode installs the package on next session start, then `plugin.ts#config()` auto-copies the skills into `.opencode/skills/` (idempotent — checks `.version` marker).

For local development against a checkout of this repo, reference the directory directly:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-auto-qcgates"]
}
```

## Development

```bash
# Clone and install
git clone https://github.com/Expert-Vision-Software/opencode-auto-qcgates.git
cd opencode-auto-qcgates
bun install

# Type-check (no emit — this package is published as .ts sources)
bun run check

# Run the test suite
bun test

# Smoke-test the CLI against the local checkout
bunx . install --scope local
bunx . status
```

`prepublishOnly` runs `bun run check && bun test` automatically before any `npm publish`. The CI release workflow (`.github/workflows/release.yml`) extracts release notes from `CHANGELOG.md`, creates a GitHub Release, then runs `npm publish --provenance --access public` (requires the `NPM_TOKEN` secret and `id-token: write` permission for provenance).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the file layout, architecture decisions, and authoring conventions.

## Acknowledgments

- [OpenCode](https://opencode.ai) — plugin architecture, skill loader, config schema
- The open-source community — for testing frameworks, coverage tools, and CI/CD best practices

---

<div align="center">

**[📦 Install from npm](https://www.npmjs.com/package/opencode-auto-qcgates)** · **[🤝 Contribute](CONTRIBUTING.md)** · **[📄 License](LICENSE)**

</div>