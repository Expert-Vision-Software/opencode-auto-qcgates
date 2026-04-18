---
name: test-baselining
description: Test execution, baseline management, and threshold evaluation for quality gates. Activates when user asks to run tests, evaluate against baseline, or update test baselines.
---

# Test Baselining Skill

A generalized skill for executing tests, managing baselines, and evaluating quality gates across projects with threshold-based decision making.

## Purpose

Provides a standardized framework for:
- **Running tests** across backend and frontend layers
- **Capturing baselines** of key metrics (test counts, pass rates, coverage, build times)
- **Evaluating against thresholds** to determine quality gate pass/fail
- **Conditional baseline updates** only when criteria are met

## When to Use

Activate this skill when a user:
- Asks to "run tests", "execute tests", or "run the test suite"
- Requests to "evaluate against baseline" or "check baseline"
- Asks to "update test baselines" or "update baselines"
- Wants to know if changes have impacted quality metrics beyond acceptable thresholds

## Commands

### `init` — Initialize Baseline

Creates a new `@testing-baseline.xml` file with current test metrics as the baseline.

**When to use:** When setting up baseline for the first time or regenerating from scratch.

**Workflow:**
```
Build → Test_Backend → Test_Frontend → Capture Metrics → Create Baseline
```

### `eval` (default) — Evaluate Against Baseline

Compares current test execution results against the existing baseline using threshold rules.

**When to use:** Default behavior when running tests with quality gate evaluation.

**Workflow:**
```
Build → Test_Backend → Test_Frontend → Evaluate → Decision
```

### `update` — Conditional Baseline Update

Updates the baseline only if PASS criteria are met AND thresholds are exceeded.

**When to use:** When user explicitly requests baseline update after confirming new baseline is acceptable.

**Workflow:**
```
Build → Test_Backend → Test_Frontend → Evaluate → (PASS + threshold exceeded?) → Update : No Update
```

## Pass Criteria

All tests pass (0 failures), no build errors, no linting errors.

## Zero Tolerance Rules

- **No real APIs in tests** — All external dependencies must be mocked
- **Domain isolation** — ZERO external network dependencies in test suite
- **Stop on failure** — Immediately halt execution on test failure

## Execution Workflow

### Stage 1: Build

1. Build backend (compile, lint check)
2. Build frontend (compile, lint check)
3. Abort pipeline if either build fails

### Stage 2: Test Backend

1. Execute backend test suite with coverage collection
2. Record metrics: test count, pass count, fail count, pass rate, coverage %, duration

### Stage 3: Test Frontend

1. Execute frontend unit tests with coverage collection
2. Execute frontend e2e tests
3. Record metrics: test count, pass count, fail count, pass rate, coverage %, duration

### Stage 4: Evaluate

Compare current metrics against baseline and apply threshold matrix.

### Stage 5: Decision

Based on evaluation results, determine next action (see Decision Matrix below).

## Baseline XML Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<testing-baseline version="1.0" generated="YYYY-MM-DDTHH:MM:SSZ">
  <metadata>
    <project>project-name</project>
    <branch>branch-name</branch>
    <commit>commit-hash</commit>
  </metadata>
  <backend>
    <testCount>0</testCount>
    <passCount>0</passCount>
    <failCount>0</failCount>
    <passRate>0.00</passRate>
    <coverage>0.00</coverage>
    <duration>0</duration>
    <buildTime>0</buildTime>
  </backend>
  <frontend>
    <unitTests>
      <testCount>0</testCount>
      <passCount>0</passCount>
      <failCount>0</failCount>
      <passRate>0.00</passRate>
      <coverage>0.00</coverage>
      <duration>0</duration>
    </unitTests>
    <e2eTests>
      <testCount>0</testCount>
      <passCount>0</passCount>
      <failCount>0</failCount>
      <passRate>0.00</passRate>
      <duration>0</duration>
    </e2eTests>
    <buildTime>0</buildTime>
  </frontend>
</testing-baseline>
```

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

### Decision Logic

```
IF test_result == PASS AND threshold_exceeded == TRUE:
    → UPDATE baseline
    → Report metrics with delta

ELIF test_result == PASS AND threshold_exceeded == FALSE:
    → NO UPDATE needed
    → Report "within threshold"

ELIF test_result == FAIL:
    → STOP immediately
    → REPORT failure details
    → PLAN fix approach
    → Obtain APPROVAL before proceeding
    → FIX identified issues
    → Re-run evaluation
```

## Stop-Failure Protocol

When tests fail:

1. **STOP** — Immediately halt further test execution
2. **REPORT** — Provide detailed failure output (test name, message, stack trace)
3. **PLAN** — Outline approach to fix failures
4. **APPROVAL** — Wait for user confirmation before proceeding with fixes
5. **FIX** — Implement corrections

## Error Handling

| Scenario | Response |
|----------|----------|
| Baseline file missing | Prompt user to run `init` command |
| Build failure | Report build errors, do not proceed to tests |
| Test framework unavailable | Report error, do not proceed |
| Invalid baseline XML | Warn user, offer to regenerate |

## Output Format

Report should include:

- **Status**: PASS / FAIL
- **Test summary**: counts, pass rate, duration per layer
- **Threshold evaluation**: which metrics exceeded (if any)
- **Delta from baseline**: +/- change for each metric
- **Recommendation**: update baseline (if applicable) or fix required

## Example Baseline File

```xml
<?xml version="1.0" encoding="utf-8"?>
<testing-baseline version="1.0" generated="2026-04-10T02:30:00Z">
  <metadata>
    <project>my-project</project>
    <branch>main</branch>
    <commit>a1b2c3d4e5f6</commit>
  </metadata>
  <backend>
    <testCount>150</testCount>
    <passCount>150</passCount>
    <failCount>0</failCount>
    <passRate>100.00</passRate>
    <coverage>82.50</coverage>
    <duration>45000</duration>
    <buildTime>30000</buildTime>
  </backend>
  <frontend>
    <unitTests>
      <testCount>320</testCount>
      <passCount>318</passCount>
      <failCount>2</failCount>
      <passRate>99.38</passRate>
      <coverage>75.00</coverage>
      <duration>28000</duration>
    </unitTests>
    <e2eTests>
      <testCount>24</testCount>
      <passCount>24</passCount>
      <failCount>0</failCount>
      <passRate>100.00</passRate>
      <duration>120000</duration>
    </e2eTests>
    <buildTime>45000</buildTime>
  </frontend>
</testing-baseline>
```

## Integration Notes

This skill is backend/frontend agnostic. Implementation should:
- Adapt build commands to project type (dotnet, npm, maven, gradle, etc.)
- Adapt test commands to test framework (xunit, jest, vitest, pytest, etc.)
- Adapt coverage tools to language/platform
- Preserve the threshold rules and decision matrix exactly
- Maintain the baseline XML schema structure for portability
