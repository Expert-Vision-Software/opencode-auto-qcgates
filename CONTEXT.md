# opencode-auto-qcgates

Domain vocabulary for an OpenCode plugin that delivers two skills — `test-baselining` and `regression-checking` — into consumer projects, where they evaluate test results against a frozen baseline and emit decision signals for humans and agents.

## Language

### Quality

**Quality Gate**:
The pass/fail decision produced by comparing current test metrics against a baseline under threshold rules. The plugin's reason for existing.
_Avoid_: check, gate, policy

**Threshold**:
A numeric rule attached to a metric (e.g. ">10% change") that defines when drift is considered meaningful.
_Avoid_: limit, rule, bound

**Threshold Exceeded**:
A metric delta that crossed its threshold in the qualifying direction. Triggers a baseline update on PASS.
_Avoid_: violation, breach

**Risk Level**:
A qualitative ranking (`low`, `medium`, `high`, `critical`) of how dangerous a quality state is to act on.
_Avoid_: severity, danger, impact

### Baseline

**Baseline**:
A frozen snapshot of test metrics at a moment in time, used as the reference for all subsequent evaluations. Versioned by a Baseline Marker.
_Avoid_: reference, snapshot, target

**Baseline Marker**:
The zero-padded `BL-NNN` identifier (e.g. `BL-001`) for a specific baseline version. Incremented on each update.
_Avoid_: baseline id, version, label

**Changelog Entry**:
One historical record tied to a Baseline Marker — date plus an auto-generated summary of which thresholds were crossed. Pruned FIFO to 10 entries.
_Avoid_: log entry, history item

### Evaluation

**Pass Criteria**:
The conditions that must all hold for an evaluation to be classified PASS — zero test failures, no build errors, no lint errors.
_Avoid_: success criteria, green criteria

**Fail Criteria**:
The conditions that cause an evaluation to be FAIL — any test failure, build error, or lint error.
_Avoid_: failure conditions, red criteria

**Stop-Failure Protocol**:
The discipline of halting immediately on test failure, reporting, planning, awaiting approval, then fixing. No silent retry, no auto-fix.
_Avoid_: fail-fast, error handling

**Domain Isolation**:
The rule that domain tests run with zero external dependencies and no mocks. The single most load-bearing test-discipline rule.
_Avoid_: pure domain, isolated domain

**Decision Signal**:
The structured output (`PROCEED`, `STOP`, or `REVIEW`) emitted to autonomous agents so they can act without parsing the human narrative.
_Avoid_: agent signal, status code

**Quality Narrative**:
The human-readable regression report — status badge, metric deltas, threshold violations, risk, recommendation.
_Avoid_: report, summary

### Artifacts

**Testing Protocol**:
The consumer-project markdown file (`testing-protocol.md`) defining workflow stages, thresholds, and pass/fail criteria. Source of truth for evaluation rules at the consumer site.
_Avoid_: protocol file, config

**Testing Baseline**:
The consumer-project XML file (`testing-baseline.xml`) holding current baseline metrics and the changelog.
_Avoid_: baseline file, metrics file

**Consumer Project**:
The downstream repo that runs the skills. Receives `testing-protocol.md` and `testing-baseline.xml` at its root after `init`.
_Avoid_: host project, target repo, downstream

**Skill Asset**:
A bundled file (SKILL.md or template under `assets/`) shipped by this plugin and copied verbatim into a consumer project.
_Avoid_: asset, template, bundled file

### Commands

**Command Argument**:
The `init`, `eval`, or `update` argument supplied to `/test-baseline`. Defaults to `eval`.
_Avoid_: command param, flag