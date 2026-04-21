# OpenCode Auto Quality Gates

**OpenCode plugin for automated quality gate evaluation.** Run tests, detect regressions, and make commit/release decisions with confidence. Built for autonomous coding agents and human developers working with AI assistants.

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

## Uninstall

Remove the plugin entry from `.opencode/opencode.json`, or run:

```bash
opencode plugin remove "expert-vision-software/opencode-auto-qcgates"
```