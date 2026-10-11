---
name: "test-baselining"
description: "Test execution, baseline management, and threshold evaluation for quality gates. Use when running tests, evaluating against baseline, or updating baselines in a consumer project. Reads testing-protocol.md from the consumer project root for workflow and threshold definitions."

# Optional soft dependencies — advisory only: no host enforces this. Loaded
# via `loadSkill` at runtime when the `init` "can't infer" trigger fires.
# Declared in the schema's `metadata` string-map so the dependency stays
# discoverable to human and agent readers.
metadata:
  "optional-deps": "grilling"
---

# Test Baselining

A generalized skill for executing tests, capturing metrics, and evaluating quality gates by comparing against a frozen baseline. Works under any dot-agents-compatible agent (Claude Code, OpenCode, etc.) — the body is agent-agnostic; OpenCode-specific bindings are noted in the last section.

## Purpose

Provides a standardized framework for:
- **Running tests** across one or more project tiers (backend, frontend, documents, anything with a repeatable verification procedure)
- **Capturing baselines** of key metrics (counts, pass rates, coverage, build time, artifact size)
- **Evaluating against thresholds** to decide whether the quality gate passes
- **Updating the baseline** only when criteria are met

## Consumer Project Files

After `init`, two files live at the consumer project root:

| File | Purpose |
|------|---------|
| `testing-protocol.md` | Workflow stages, thresholds, and pass/fail criteria — **specific to this consumer project's tiers and toolchain** |
| `testing-baseline.xml` | Baseline metrics and changelog |

These files are the single source of truth for evaluation. The skill reads them every run; never inline a copy.

## Locating the Consumer Files

Locate `testing-protocol.md` and `testing-baseline.xml` deterministically. Try, in order:

1. **Project root** — the working-tree root of the consumer's source control (git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS** (Unity Version Control / Plastic SCM), Perforce, Bazaar, Darcs, …). Use `refs/source-controls.md` as the VCS-agnostic lookup table; it lists the local root marker per VCS and the right "has changes?" command for the regression-check cache.
2. **Current working directory** — fallback when no source-control root is reachable.
3. **Stop and ask** if neither exists or they disagree on tier structure. Never invent a path.

When you find them in a non-root location (monorepo subpackage, Unity `Packages/com.<vendor>.<name>/`, etc.), use them and warn the user that thresholds may not match the outer project.

The skills are **VCS-agnostic at the body level**: every reference to "git diff" or `.git/` above is a stand-in for whatever source control the project uses. The actual command and marker vary by VCS — `refs/source-controls.md` carries the lookup table, the agent runs it, and falls forward.

## Commands

### `init` — Initialize Baseline

Build the consumer's first `testing-protocol.md` and `testing-baseline.xml` from the actual project, not from a generic template.

**Step 1 — classify the consumer.** Decide which branch applies:

- **Code project** — has a toolchain (build commands, test commands, coverage tooling). Proceed to Step 2.
- **Non-code project** — repo of documents, configs, books, policies, data. Proceed to Step 2 anyway; the "tiers" become document classes or verification passes, and "tests" become deterministic checks (linters, validators, schema checks, count rules). Skip the build stage; the Build step becomes `validate`.

**Step 1.5 — detect "can't infer" trigger.** Before grilling on tier dimensions, decide whether the tier set is inferable from the consumer's actual files. The fallback to `grilling` fires when **either** condition holds:

- **(A) No recognizable manifest at the source-control working-tree root.** None of `package.json`, `*.csproj`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle*`, `manifest.json`, `composer.json`, `pubspec.yaml`, `mix.exs`, `Gemfile`, `deno.json*` is present. (See `refs/source-controls.md` for working-tree-root lookup.)
- **(B) Tier grill fails to converge.** The six questions in Step 2 can't be answered in one pass — the user can't name the tier set, the toolchain, or the build-artifact directory from the available files.

If either condition holds, **delegate the interview to the `grilling` skill**:

1. **Prefer permanent install.** Probe `<base>/skills/grilling/` (the active agent's standard skills root). If present, call `tool loadSkill({ name: "grilling" })` and follow the loaded skill's body.
2. **Otherwise one-shot.** If not present, shell out: `CI=true npx -y skills use mattpocock/skills --skill grilling`. Capture stdout (the generated prompt), treat it as the interview protocol, and follow it inline.
3. **Otherwise fall through.** If `npx` fails (no network, no node, user denied), the agent drops back to the inline Step 2 grill table and asks the user directly. The chain is best-effort, never load-bearing.

After `grilling` resolves the design tree, capture the resolved tier set, toolchain, and artifact directory from the grill output and resume Step 2 with those as inputs — do not re-ask settled questions.

> **Source.** `grilling` is not shipped by this plugin. Fetch on demand with:
>
> ```
> CI=true npx -y skills use mattpocock/skills --skill grilling
> ```
>
> Or install permanently (default agent `universal` if unknown):
>
> ```
> npx -y skills add mattpocock/skills --skill grilling -a universal
> ```
>
> If neither path is reachable (no `npx`, no network, no install), the
> `loadSkill` call is a no-op and the agent falls through to the inline
> Step 2 table — the chain is best-effort, never load-bearing.

**Step 2 — discover tiers.** Grilling is mandatory whenever tiers are not obvious. **Before grilling**, consult the bundled init-time references so the questions are grounded in the project's actual stack — not in template defaults:

- `refs/source-controls.md` — which source control is the project on? Determines the consumer-root lookup during eval/update; **always relevant, not init-only**.
- `refs/backends-ref.md` — backend-toolchain map (C#, JVM, Go, Rust, Python, Node, Elixir, …) and a 10-question grill order. **Init-only.** Once the protocol is written, this file has no bearing.
- `refs/frontend-refs.md` — frontend-stack map (React, Vue, Svelte, Angular, Solid, **Aurelia 2**, Lit, Ember, HTMX, …) and a 10-question grill order. **Init-only.** Once the protocol is written, this file has no bearing.

The skills themselves are backend-language and frontend-framework agnostic at the body level; these references are *grill scaffolding only* — confirm every stack choice with the user before you pin it in the protocol.

Ask, in order, until each tier is named and bounded:

| Question | Why it matters |
|----------|----------------|
| What tiers exist? (backend, frontend, scripts, docs, schemas, …) | Determines protocol sections and XML structure |
| What is the toolchain per tier? (dotnet, npm, pip, scripts, validators) | Determines the command to run per stage |
| What is the test framework per tier? (xUnit, Jest, Vitest, pytest, none) | Determines which metrics to capture |
| What is the coverage tool per tier? (coverlet, v8, coverage.py, none) | Determines coverage metrics |
| **What is the build-artifact directory per tier? (bin/, dist/, target/, build/, _build/, out/, .next/, storybook-static/)** | **Always-recorded baseline metric (file count, total MB, gzipped KB of critical files, build time). Do not skip.** |
| Are there external services under test? | Domain Isolation rule applies |

For each tier, name it, pick a toolchain, pick a metric set, and identify the artifact directory. The union becomes the protocol.

If a backends or frontends reference shortlists a stack the user names verbatim, **still confirm the exact command**, the **exact build command**, and the **exact artifact directory** with the user before you write them — the project's actual `package.json` / `csproj` / `Cargo.toml` is the truth, not the row in the reference.

**Step 3 — write `testing-protocol.md`.** Tailor the template (`templates/testing-protocol.md`) to the discovered tiers:

- One `<stage>` per tier (replace the template's `Test_Backend` / `Test_Frontend` with the actual tier names: `Test_Api`, `Test_Web`, `Test_Docs_Lint`, `Test_Schema_Validate`, …)
- Adapt the build/test/coverage commands to the toolchain each tier uses
- Set thresholds from `testing-protocol.md`'s baseline_thresholds table — **do not** copy the template's default values verbatim; they are placeholders, not advice
- Adapt `pass_fail_criteria` to the actual pass rate / coverage / lint expectations of this tier set
- Adapt `anti_patterns` to the project, not the template's exemplar stack

If the template ships placeholders like `<Project name="Backend.Tests">`, replace them with real project names.

**Step 4 — write `testing-baseline.xml`.** Adapt the XML template to match the discovered tiers:

- Replace the `<Backend>` / `<Frontend>` blocks with one block per tier (rename nodes to match; keep the same metric shape: counts, pass rate, coverage, build time, warnings, artifact size)
- Replace `<Dependencies>` fields with the discovered toolchain per tier
- Set `<Metadata.BaselineId>` to `BL-001`
- Add `<Changelog><Entry>` with `Date=YYYY-MM-DD`, `Changes=Initial baseline`, `Reason=Project baseline established`

**Step 5 — run tests and capture the first baseline.** Now (and only now) execute the protocol, capture metrics, and populate the XML. Write the file. The baseline marker is `BL-001`.

**When to use:** First-time setup, or full regeneration from scratch.

### `eval` — Evaluate Against Baseline (default)

Compares current execution against the existing baseline, and **updates the baseline inline whenever the run qualifies**.

1. Locate the protocol and baseline files (see *Locating the Consumer Files*).
2. Read `testing-protocol.md` for workflow stages, thresholds, and pass/fail criteria.
3. Execute each stage against the current consumer project.
4. **Capture the build-artifact metrics for every tier** (file count, total MB, gzipped KB on critical files, build time, lint-warning categories). Skipping these means the eval is incomplete — an eval without artefact metrics is *not* "no change in artefacts", it's "artefacts not measured".
5. Compare metrics against baseline; apply threshold rules. **Artifact-size threshold compares every captured file**, not just `TotalSizeMB` — a single critical-file doubling silently breaks the budget if you only sum.
6. Report status, deltas, and violations. Include the **Build-artifact summary** from Stage 3.
7. **Update inline when the run qualifies.** The run must be PASS, at least one metric must exceed its threshold (step 5), **and step 4 must have captured build-artifact metrics** — an eval that skipped artefact capture is incomplete, not update-eligible. When all three hold, perform the update immediately, in this same run, from the metrics you just captured:

   - Run the full `update` workflow below (increment the Baseline Marker, append the Changelog Entry, refresh the per-tier artefact blocks, prune the changelog FIFO to 10, stamp `LastUpdated`). The artefact fields are never dropped.
   - **Reuse the captured metrics. Do NOT re-run the build or the tests.** The update consumes what steps 3–4 measured; a re-execution is exactly what this inline step exists to avoid.
   - Report the new Baseline Marker with the deltas, so the reader sees the baseline moved.

   A PASS run with no threshold exceeded does **not** update — report "within threshold". A FAIL run never updates; the stop-failure protocol applies.

**Single-turn contract (subagents).** Steps 1–7 complete inside one agent turn. When `eval` runs as a subagent, the same invocation that captures the metrics also writes the baseline, so the captured metrics, the resolved tier set, and the protocol/baseline locations stay in context across the update. Never hand the update to a follow-up invocation: a fresh subagent has no memory of the captured numbers and would re-execute the build and tests to rebuild them.

**When to use:** Default behavior. Run after every meaningful change to the consumer code or documents.

### `update` — Manual Baseline Update (escape hatch)

`eval` already runs this workflow inline whenever it qualifies, so an ordinary PASS-with-threshold-exceeded run needs no separate command. `update` is the **manual escape hatch** for everything the user explicitly asks for outside that path:

- **Re-baselining a FAIL.** The run failed, the metrics genuinely moved (a deliberate behavior change, an accepted coverage drop), and the user wants the new numbers to become the reference instead of fixing back to the old ones.
- **Forcing a fresh baseline.** The user wants the current state captured as the new reference regardless of thresholds — after tightening a threshold, restructuring tiers, or recovering when a qualifying eval's inline update did not complete.
- **Accepting specific numbers.** The user inspected a run and approves exactly those numbers.

Because this command can bless a FAIL or bypass thresholds, it never fires on its own: require an explicit user request, and **state what is being accepted before writing** (which checks failed, which metrics moved). This is the human-approval step of the stop-failure protocol carried through — a manual re-baseline never silently follows a FAIL. One rule is non-negotiable in every case: **the applicable eval must have captured build-artifact metrics.** If artefacts were skipped, run the `eval` (which captures them) first; a baseline update that omits artefact fields is invalid.

Workflow:

1. Increment the baseline marker (`BL-001` → `BL-002`, etc.)
2. Generate a one-sentence changelog summary naming which thresholds crossed — **include the artefacts if they are the trigger** (e.g. "Frontend entry chunk gzipped grew from 188 KB to 312 KB, +66% ▲▲, exceeds the 10% artefact-size threshold"). On a FAIL re-baseline or a forced update, say so (e.g. "Re-baselined accepted FAIL: coverage 78% → 71%").
3. Append a new `<Changelog><Entry>`; **never modify prior entries**
4. Write the per-tier `<Build>` (backend) or `<BuildArtifacts>` (frontend, or any tier with an output directory) block with the captured metrics — this is non-negotiable; a baseline update that omits artefact fields is invalid.
5. Prune the changelog to the last 10 entries (FIFO)
6. Update `<Metadata.LastUpdated>` and write the file

Metrics source: in the inline case they come from the `eval` that just ran, in context. In the manual case, reuse the most recent `eval`'s captured metrics while they are still in context; otherwise run a fresh `eval` first and update from that — never invent numbers.

**When to use:** Only on an explicit user request outside a qualifying `eval` — accepting a FAIL's new metrics, forcing a fresh baseline, or approving numbers the user inspected. A qualifying `eval` already handled the ordinary case; do not invoke `update` after it.

## Pass Criteria

All checks pass: zero failures, zero build/validate errors, zero lint errors. Numeric thresholds in the protocol refine this baseline (e.g. pass rate ≥ 90%, coverage ≥ threshold).

## Zero Tolerance Rules

- **No real APIs in tests** — every external dependency is mocked or stubbed.
- **Domain Isolation** — domain-tier tests run with **zero** external dependencies, zero mocks. Domain logic is pure.
- **Stop on failure** — on any test failure, halt the pipeline immediately.

## Execution Workflow

The protocol file is authoritative; the stages below are the canonical shape, not a substitute for the file.

### Stage 1: Build (or Validate)

Compile and lint. **Every build stage also captures the build-artifact metrics** — these are part of every eval, baseline update, and changelog entry. Do not skip even on "no-code" consumers: a documents repo still has a build (the linted/finalised PDF, EPUB, or static-site directory) with an output directory and a file count.

For code consumers:

1. Run the tier's build command.
2. Record `BuildTime` (elapsed `time`).
3. Locate the tier's `OutputDirectory` (`bin/`, `dist/`, `target/`, `build/`, `_build/`, `out/`, `.next/`, `storybook-static/`, `pkg/`, `target/release/`, …).
4. Record for the **whole output directory**: `FileCount` (excluding VCS noise like `.git`, IDE temp, generated symbol files: `.pdb`, `.dSYM`, `*.map` unless the protocol marks them load-bearing), `TotalSizeMB` (uncompressed sum).
5. Record **per-critical-file** fingerprints: the primary binary / shared library / entry chunk / CSS bundle / main font — whichever the protocol declares. For each: raw `SizeKB` and gzipped `SizeGzippedKB`. (See `refs/backends-ref.md` § "Build artifact capture" and `refs/frontend-refs.md` § "Build artifact capture" for the per-stack critical-file list.)
6. Record `LintWarnings` count, grouped by rule family (e.g. `react-hooks: 0`, `a11y: 2`, `import: 0`). The protocol's `<WarningsByCategory>` shape expands per project.

For non-code consumers, run the project's validators (markdownlint, schema validators, custom checks). Capture equivalent metrics where they apply: validation rule counts, severity counts, output artefact size for document repos that emit a final form.

### Stage 2: Per-Tier Tests

For each tier named in the protocol:

1. Execute the tier's test command with coverage collection.
2. Record: test count, pass count, fail count, pass rate, coverage %, duration.
3. **Also re-record the build-artifact metrics** (file count, total MB, gzipped KB, build time) if the tier's tests rely on a fresh build. The Stage 1 numbers are authoritative; Stage 2 only re-records when the test command itself produces or alters the output directory.

### Stage 3: Evaluate

Apply the protocol's `pass_fail_criteria` and `baseline_thresholds`. Produce:

- **Status**: PASS or FAIL
- **Violations**: each metric whose delta crossed its threshold — **artifacts included**, never omitted (a run without artifact metrics is *incomplete*, not "no change")
- **Delta**: per-metric change vs baseline, with **artifact size deltas surfaced alongside the test deltas** so regressions like "bundled font file doubled in size" aren't buried under `pass rate` lines
- **Build-artifact summary**: one line per tier (`Backend: 142 files, 47.3 MB total, 312 ms critical gzipped; Frontend: 23 files, 2.1 MB total, 188 ms entry gzipped`), so the human reader sees the artefact state at a glance

### Stage 4: Decision

```
IF test_result == PASS AND threshold_exceeded == TRUE:
    → UPDATE baseline INLINE (this run — reuse captured metrics; do NOT re-execute build/tests)
    → Report metrics with deltas and the new Baseline Marker
ELIF test_result == PASS AND threshold_exceeded == FALSE:
    → NO UPDATE needed; report "within threshold"
ELIF test_result == FAIL:
    → STOP immediately
    → REPORT failure details
    → PLAN fix approach
    → Obtain APPROVAL before proceeding
    → FIX identified issues
    → Re-run evaluation
```

## Baseline XML Structure

The XML holds **only** what the protocol declares. Adapt the template (`templates/testing-baseline.xml`) to the consumer's actual tiers — the placeholders for `<Backend>` / `<Frontend>` are examples, not requirements.

**Hard rule on build artefacts:** every tier the protocol declares as producing a build artefact (i.e. has an `OutputDirectory`) carries a `<Build>` (backend-style) or `<BuildArtifacts>` (frontend-style) block. **Every eval must capture these artefact fields; a baseline update that drops or zeroes any of them is invalid.** The block's `FileCount`, `TotalSizeMB`, `BuildTime`, `<KeyFiles>` (or `<CriticalFiles>`), and `<LintWarningsByCategory>` (if the build runs a linter) fields are mandatory. `init` seeds them from the actual build; `eval` updates them; `update` refreshes them with the new numbers — same field set across all three flows, no exceptions.

## Baseline Marker & Changelog

- Marker: `BL-NNN`, zero-padded (`BL-001`, `BL-002`, … `BL-999`).
- `init` sets `BL-001`. Each `update` increments.
- Changelog entries: `<BaselineId>`, `<Date>`, `<ChangeSummary>`. Append-only — never edit prior entries.
- Changelog auto-pruned to last 10 entries (FIFO).

## Threshold Matrix (defaults — protocol overrides)

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Test count | > 10% change | Any |
| Pass rate | > 10% change | Any |
| Build time | > 10% increase | Up only |
| Coverage | > 5% change | Any |
| Test duration | > 20% increase | Up only |
| Artifact size | > 10% change | Any |

The protocol's `baseline_thresholds` table is the live source. These defaults exist only to seed an empty protocol.

## Output Format

Every eval reports:

- **Status**: PASS / FAIL
- **Per-tier summary**: counts, pass rate, duration
- **Threshold evaluation**: which metrics exceeded — **artefact deltas surface alongside test deltas, never buried**
- **Delta from baseline**: +/- change per metric
- **Build-artifact summary**: one line per tier (`TierName: N files, M MB total, K ms critical-file gzipped; lint warnings by category: a:0, b:2`)
- **Baseline action**: when the run qualified, the update that just happened (and the new `BL-NNN` marker); otherwise "within threshold — no update"; on FAIL, the fix required

## Stop-Failure Protocol

When any check fails:

1. **STOP** — halt further execution
2. **REPORT** — test/check name, message, stack/output
3. **PLAN** — outline the fix approach
4. **APPROVAL** — wait for user confirmation
5. **FIX** — implement corrections
6. **Re-run** the eval

## Error Handling

| Scenario | Response |
|----------|----------|
| Protocol file missing | Run `init` (grill the user for tiers first) |
| Baseline file missing | Run `init` |
| Build / validate failure | Report errors; do not proceed to tests |
| Framework unavailable | Report; do not proceed |
| Invalid XML | Warn, offer to regenerate via `init` |
| Files in non-standard location | Warn, proceed with located files |

## Integration Notes

This skill is tier-agnostic. Implementation adapts to whatever tiers and tools the consumer's protocol declares. Never assume "backend = dotnet, frontend = npm" — the protocol is the truth.

## OpenCode

OpenCode-specific bindings for this skill:

- **Slash command** — `/test-baseline init|eval|update` runs in the current agent's main conversation (`subtask: false` in the command frontmatter, so no subagent is spawned). The command body loads this skill via the `loadSkill` tool.
- **Single-turn eval → update** — a qualifying `/test-baseline eval` evaluates and updates the baseline inside one agent turn (the single-turn contract above). Because the command stays in the main conversation, the captured metrics remain in context through the update, so no follow-up `update` command and no test re-execution is needed.
- **Skill allowlist** — `src/plugin.ts` sets `agent.task.permission.skill["test-baselining"] = "allow"` so the task agent can reach this skill without a prompt.
- **Optional skill chain** — `init` may invoke `loadSkill({ name: "grilling" })` when no manifest is present (A) or the inline tier grill fails to converge (B). The chain is best-effort; a missing skill falls through to the inline Step 2 table. `src/plugin.ts` adds `grilling` to `agent.task.permission.skill` alongside `test-baselining` and `regression-checking` — the entry is harmless if the skill isn't installed; OpenCode consults the allowlist only when the loadSkill tool is actually invoked.
- **Install layout** — OpenCode's plugin harness copies this skill to `.opencode/skills/test-baselining/` (project) or `~/.config/opencode/skills/test-baselining/` (global). Idempotency is gated on the install manifest at `<configBase>/<package>.manifest.json`, which records the installed version and a per-file sha256 for each copied file: a version-and-hash match is a zero-write no-op, and files whose hash no longer matches (consumer edits) are preserved rather than overwritten.
- **Asset reuse** — Both `test-baselining` and `regression-checking` are model-invoked skills (they each carry a `description`) so any subagent that loads them can chain the other. `regression-checking` calls `loadSkill({ name: "test-baselining" })` to reuse this skill's execution workflow.

For non-OpenCode agents (Claude Code, etc.), the same `SKILL.md` and command markdown files work — the frontmatter field OpenCode adds (`subtask`) is ignored, and `loadSkill` resolves through the agent's own skill loader.