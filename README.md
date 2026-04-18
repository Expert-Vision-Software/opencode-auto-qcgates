# opencode-auto-qcgates

Test execution, baseline management, and threshold evaluation for quality gates.

## Overview

This plugin provides a standardized framework for:
- **Running tests** across backend and frontend layers
- **Capturing baselines** of key metrics (test counts, pass rates, coverage, build times)
- **Evaluating against thresholds** to determine quality gate pass/fail
- **Conditional baseline updates** only when criteria are met

## Installation

### Option 1: opencode.json (recommended)

Add to `.opencode/opencode.json` in your project:

```json
{
  "plugin": ["opencode-auto-qcgates"]
}
```

OpenCode will resolve the plugin from npm on first run.

For local development with a file path:

```json
{
  "plugin": ["file:///path/to/opencode-auto-qcgates"]
}
```

### Option 2: CLI

```bash
opencode plugin add opencode-auto-qcgates
```

For a local checkout:

```bash
opencode plugin add file:///path/to/opencode-auto-qcgates
```

## Uninstall

Remove the plugin entry from `.opencode/opencode.json`, or run:

```bash
opencode plugin remove opencode-auto-qcgates
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/test-baseline eval` | Evaluate current tests against baseline (DEFAULT) |
| `/test-baseline init` | Initialize a new baseline from current test results |
| `/test-baseline update` | Update baseline if current results PASS and thresholds exceeded |

### Examples

```bash
# Evaluate tests against existing baseline
/test-baseline eval

# Create initial baseline
/test-baseline init

# Update baseline after confirming improvements
/test-baseline update
```

## Workflow

### Stage 1: Build
- Build backend (compile, lint check)
- Build frontend (compile, lint check)
- Abort pipeline if either build fails

### Stage 2: Test Backend
- Execute backend test suite with coverage collection
- Record metrics: test count, pass count, fail count, pass rate, coverage %, duration

### Stage 3: Test Frontend
- Execute frontend unit tests with coverage collection
- Execute frontend e2e tests
- Record metrics: test count, pass count, fail count, pass rate, coverage %, duration

### Stage 4: Evaluate
- Compare current metrics against baseline
- Apply threshold matrix

### Stage 5: Decision
- PASS + threshold exceeded → Update baseline
- PASS + threshold not exceeded → No update needed
- FAIL → Report failures, stop immediately

## Pass Criteria

All tests pass (0 failures), no build errors, no linting errors.

## Zero Tolerance Rules

- **No real APIs in tests** — All external dependencies must be mocked
- **Domain isolation** — ZERO external network dependencies in test suite
- **Stop on failure** — Immediately halt execution on test failure

## Threshold Matrix

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Test count | > 10% change | Any |
| Pass rate | > 10% change | Any |
| Build time | > 10% increase | Up only |
| Coverage (backend) | > 5% change | Any |
| Coverage (frontend) | > 5% drop | Down only |
| Test duration (frontend) | > 20% increase | Up only |
| Artifact size | > 10% change | Any |

## Decision Matrix

| Test Result | Threshold Exceeded | Action |
|-------------|---------------------|--------|
| PASS | Yes | Update baseline |
| PASS | No | No update (acceptable) |
| FAIL | Yes | No update (report first) |
| FAIL | No | No update (report first) |

## Stop-Failure Protocol

When tests fail:
1. **STOP** — Immediately halt further test execution
2. **REPORT** — Provide detailed failure output
3. **PLAN** — Outline approach to fix failures
4. **APPROVAL** — Wait for user confirmation before proceeding with fixes
5. **FIX** — Implement corrections
6. **Re-run** — Evaluate again

## Configuration

The plugin uses `@testing-baseline.xml` for baseline storage. See `docs/instructions/testing-protocol.md` for detailed configuration options.

## Architecture

This plugin is backend/frontend agnostic. Implementation adapts to:
- Build commands (dotnet, npm, maven, gradle, etc.)
- Test frameworks (xunit, jest, vitest, pytest, etc.)
- Coverage tools (cobertura, v8, coveragepy, etc.)

See `AGENTS.md` for detailed agent instructions.
