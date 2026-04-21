---
name: test-baselining
description: Test execution, baseline management, and threshold evaluation for quality gates. Activates when user asks to run tests, evaluate against baseline, or update test baselines. Reads testing-protocol.md from the consumer project for workflow and threshold definitions.
---

# Test Baselining Skill

A generalized skill for executing tests, managing baselines, and evaluating quality gates across projects with threshold-based decision making.

## Purpose

Provides a standardized framework for:
- **Running tests** across backend and frontend layers
- **Capturing baselines** of key metrics (test counts, pass rates, coverage, build times)
- **Evaluating against thresholds** to determine quality gate pass/fail
- **Conditional baseline updates** only when criteria are met

## Consumer Project Files

After `init`, the following files exist at the consumer project root:

| File | Description |
|------|-------------|
| `testing-protocol.md` | Protocol definition with execution workflow, thresholds, and decision logic |
| `testing-baseline.xml` | Baseline metrics and changelog |

If these files are not at the project root, the skill searches upward from the working directory to locate them.

## Commands

### `init` — Initialize Baseline

Creates `testing-protocol.md` and `testing-baseline.xml` at the consumer project root.

**When to use:** When setting up baseline for the first time or regenerating from scratch.

**Workflow:**
```
Copy testing-protocol.md → Build → Test_Backend → Test_Frontend → Capture Metrics → Create Baseline
```

**Actions:**
1. Copy/tailor `testing-protocol.md` from plugin assets to consumer project root
2. Build and run tests to capture current metrics
3. Create `testing-baseline.xml` with initial baseline marker `BL-001`
4. Create initial changelog entry: "Initial baseline created"

### `eval` (default) — Evaluate Against Baseline

Compares current test execution results against the existing baseline using threshold rules.

**When to use:** Default behavior when running tests with quality gate evaluation.

**Workflow:**
```
Build → Test_Backend → Test_Frontend → Evaluate → Decision
```

**Actions:**
1. Locate `testing-protocol.md` and `testing-baseline.xml` in consumer project
2. Read protocol file for workflow, thresholds, and decision logic
3. Execute build and tests
4. Compare metrics against baseline
5. Report pass/fail with threshold deltas

### `update` — Conditional Baseline Update

Updates the baseline only if PASS criteria are met AND thresholds are exceeded.

**When to use:** When user explicitly requests baseline update after confirming new baseline is acceptable.

**Workflow:**
```
Build → Test_Backend → Test_Frontend → Evaluate → (PASS + threshold exceeded?) → Update : No Update
```

**Actions:**
1. Parse current baseline marker (e.g., `BL-001`)
2. Increment marker to next version (e.g., `BL-002`)
3. Auto-generate one-sentence changelog summary based on which thresholds were exceeded
4. Append new changelog entry, prune to last 10 entries (FIFO)
5. Update `LastUpdated` timestamp
6. Save updated `testing-baseline.xml`

## Baseline File Discovery

Files are expected at the consumer project root. If not found:

1. Check working directory for `testing-protocol.md` and `testing-baseline.xml`
2. Search upward to nearest `.git` parent directory
3. If files exist elsewhere in the repo, use them and warn the user
4. If files are missing, prompt user to run `init`

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
<TestingBaseline>
  <Metadata>
    <LastUpdated>YYYY-MM-DDTHH:MM:SSZ</LastUpdated>
    <BaselineId>BL-001</BaselineId>
    <Framework>Generic Multi-Stack</Framework>
  </Metadata>
  <Backend>
    <!-- backend metrics -->
  </Backend>
  <Frontend>
    <!-- frontend metrics -->
  </Frontend>
  <Changelog>
    <Entry>
      <BaselineId>BL-001</BaselineId>
      <Date>YYYY-MM-DD</Date>
      <ChangeSummary>Initial baseline created</ChangeSummary>
    </Entry>
  </Changelog>
</TestingBaseline>
```

## Baseline Marker & Changelog

### Marker Format
- Pattern: `BL-NNN` (3-digit, zero-padded: `BL-001`, `BL-002`, ... `BL-999`)
- Set on `init` to `BL-001`
- Incremented on each `update` command

### Changelog Entry Structure
- `<BaselineId>`: The marker for this baseline version
- `<Date>`: ISO date when baseline was created
- `<ChangeSummary>`: Auto-generated one-sentence summary of reason for new baseline

### Changelog Summary Generation
The skill auto-generates the summary based on which thresholds were exceeded:

| Scenario | Example Summary |
|----------|-----------------|
| User requested | "User requested baseline update" |
| Test count change | "Test count increased by X%, thresholds exceeded" |
| Coverage change | "Coverage improved by X%, thresholds exceeded" |
| Multiple thresholds | "Test count +X%, coverage +Y%, build time +Z%, thresholds exceeded" |

### Changelog Pruning
- Maximum 10 entries retained
- When limit is exceeded, oldest entry is removed (FIFO)

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
| Protocol file missing | Prompt user to run `init` command |
| Baseline file missing | Prompt user to run `init` command |
| Build failure | Report build errors, do not proceed to tests |
| Test framework unavailable | Report error, do not proceed |
| Invalid baseline XML | Warn user, offer to regenerate |
| Files in non-standard location | Warn user, proceed with located files |

## Output Format

Report should include:

- **Status**: PASS / FAIL
- **Test summary**: counts, pass rate, duration per layer
- **Threshold evaluation**: which metrics exceeded (if any)
- **Delta from baseline**: +/- change for each metric
- **Recommendation**: update baseline (if applicable) or fix required

## Example Baseline File

```xml
<?xml version="1.0" encoding="UTF-8"?>
<TestingBaseline>
  <Metadata>
    <LastUpdated>2026-04-10T00:00:00Z</LastUpdated>
    <BaselineId>BL-001</BaselineId>
    <Framework>Generic Multi-Stack</Framework>
  </Metadata>
  <Backend>
    <UnitTests>
      <Framework>xUnit/NUnit/Jest/Vitest/pytest</Framework>
      <TestFiles>0</TestFiles>
      <TestProjects>
        <Project name="Backend.Tests" tests="0" />
      </TestProjects>
      <Passed>0</Passed>
      <Failed>0</Failed>
      <Skipped>0</Skipped>
      <Total>0</Total>
      <Errors>0</Errors>
      <Duration>0.00</Duration>
    </UnitTests>
    <IntegrationTests>
      <Framework>xUnit + Moq / Jest / pytest</Framework>
      <Status>Active</Status>
      <Total>0</Total>
      <Passed>0</Passed>
      <Failed>0</Failed>
    </IntegrationTests>
    <E2ETests>
      <Framework>WebApplicationFactory / Playwright / Cypress</Framework>
      <Status>Active</Status>
      <Total>0</Total>
      <Passed>0</Passed>
      <Failed>0</Failed>
    </E2ETests>
    <Coverage>
      <LineRate>0.00</LineRate>
      <BranchRate>0.00</BranchRate>
      <LinesCovered>0</LinesCovered>
      <LinesValid>0</LinesValid>
      <BranchesCovered>0</BranchesCovered>
      <BranchesValid>0</BranchesValid>
      <Complexity>0</Complexity>
    </Coverage>
    <Build>
      <Status>Success</Status>
      <BuildTime>0.00</BuildTime>
      <TotalProjects>0</TotalProjects>
      <Warnings>0</Warnings>
      <WarningsByCategory>
        <Nullability>0</Nullability>
        <Obsolete>0</Obsolete>
        <UnusedVariables>0</UnusedVariables>
        <PossibleNullReference>0</PossibleNullReference>
        <PackageResolution>0</PackageResolution>
        <DeprecatedAPIs>0</DeprecatedAPIs>
      </WarningsByCategory>
      <OutputDirectory>./bin</OutputDirectory>
      <FileCount>0</FileCount>
      <TotalSizeMB>0</TotalSizeMB>
    </Build>
  </Backend>
  <Frontend>
    <UnitTests>
      <Framework>Vitest/Jest</Framework>
      <CoverageTool>@vitest/coverage-v8 / jest-coverage</CoverageTool>
      <TestFiles>0</TestFiles>
      <Passed>0</Passed>
      <Failed>0</Failed>
      <Skipped>0</Skipped>
      <Total>0</Total>
      <Duration>0.00</Duration>
    </UnitTests>
    <ComponentTests>
      <Framework>@aurelia/testing / @testing-library</Framework>
      <Status>Planned</Status>
      <Total>0</Total>
      <Passed>0</Passed>
      <Failed>0</Failed>
    </ComponentTests>
    <E2ETests>
      <Framework>Playwright/Cypress/Selenium</Framework>
      <Status>Active</Status>
      <TestFiles>0</TestFiles>
      <Total>0</Total>
      <Passed>0</Passed>
      <Skipped>0</Skipped>
      <Failed>0</Failed>
      <Duration>0.00</Duration>
    </E2ETests>
    <Coverage>
      <Statements>0.00</Statements>
      <Branches>0.00</Branches>
      <Functions>0.00</Functions>
      <Lines>0.00</Lines>
    </Coverage>
    <BuildArtifacts>
      <BuildTime>0.00</BuildTime>
      <OutputDirectory>./dist</OutputDirectory>
      <TotalSizeMB>0</TotalSizeMB>
      <KeyFiles>
        <File>
          <Name>index.html</Name>
          <SizeKB>0.00</SizeKB>
          <SizeGzippedKB>0.00</SizeGzippedKB>
        </File>
      </KeyFiles>
    </BuildArtifacts>
  </Frontend>
  <FailedTests>
    <Test>
      <Name>None</Name>
    </Test>
  </FailedTests>
  <FlakyTests>
    <Test>
      <Name>None</Name>
    </Test>
  </FlakyTests>
  <KnownErrors>
    <Error>
      <Description>None</Description>
    </Error>
  </KnownErrors>
  <Dependencies>
    <Backend>
      <TargetFramework>.NET/Node/Java</TargetFramework>
      <PrimaryTestFramework>xUnit/Jest/Vitest/pytest</PrimaryTestFramework>
      <BuildTooling>dotnet/npm/mvn/gradle</BuildTooling>
    </Backend>
    <Frontend>
      <NodeVersion>22.x</NodeVersion>
      <PackageManager>yarn/npm/pnpm</PackageManager>
      <PrimaryTestFramework>Vitest/Jest</PrimaryTestFramework>
      <E2ETestFramework>Playwright/Cypress</E2ETestFramework>
    </Frontend>
  </Dependencies>
  <Changelog>
    <Entry>
      <BaselineId>BL-001</BaselineId>
      <Date>2026-04-10</Date>
      <ChangeSummary>Initial baseline created</ChangeSummary>
    </Entry>
  </Changelog>
</TestingBaseline>
```

## Integration Notes

This skill is backend/frontend agnostic. Implementation should:
- Adapt build commands to project type (dotnet, npm, maven, gradle, etc.)
- Adapt test commands to test framework (xunit, jest, vitest, pytest, etc.)
- Adapt coverage tools to language/platform
- Preserve the threshold rules and decision matrix exactly
- Maintain the baseline XML schema structure for portability
- Read `testing-protocol.md` from consumer project for workflow definitions
