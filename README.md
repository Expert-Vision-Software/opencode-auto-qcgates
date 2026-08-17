<!--
  SEO description: Automated quality gate evaluation for AI coding agents. Test baselining, regression detection, and structured PROCEED/STOP/REVIEW signals that let OpenCode, Claude Code, and any skill-compatible agent self-evaluate before declaring a task done. Works with .NET, Node.js, Python, Java, Go, Rust, Elixir; supports Git, Mercurial, Subversion, Pijul, Fossil, Unity VCS, Perforce, Bazaar, Darcs.
  Keywords: AI coding agent, OpenCode, Claude Code, quality gate, regression detection, test baseline, ci/cd, autonomous agents, autonomous testing, self-evaluation, pre-commit, threshold, build artefact, bundle size, Aurelia
-->

<div align="center">

# opencode-auto-qcgates

**Automated quality gates for AI coding agents — catch regressions, answer "did we break anything?", and emit PROCEED / STOP / REVIEW signals so your agent knows when it's safe to ship.**

[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-blue?link=https://opencode.ai)](https://opencode.ai)
[![npm version](https://img.shields.io/npm/v/opencode-auto-qcgates?label=npm)](https://www.npmjs.com/package/opencode-auto-qcgates)
[![MIT License](https://img.shields.io/badge/License-MIT-green?link=LICENSE)](LICENSE)
[![DeepWiki](https://img.shields.io/badge/DeepWiki-Expert--Vision--Software%2Fopencode--auto--qcgates-blue.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost868sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/Expert-Vision-Software/opencode-auto-qcgates)

[Quick start](#quick-start) · [Use cases](#use-cases) · [Commands](#commands) · [Architecture](#architecture) · [Requirements](#requirements) · [Development](#development)

</div>

---

## The short version

Your AI agent writes a feature, says "done." — but did it break anything? Did the bundle just double in size? Did coverage crater?

**opencode-auto-qcgates** ships two skills — `test-baselining` (runs tests, captures a metrics baseline) and `regression-checking` (turns the result into `PROCEED` / `STOP` / `REVIEW` decisions). The skills themselves are **agent-agnostic**: any dot-agents-compatible agent picks them up — OpenCode, Claude Code, Codex, Cursor, and 70+ more. They adapt to whatever toolchain, test framework, and source control your project already uses.

## Use cases

- **Agent self-evaluation before declaring done.** After an agent finishes a task, it asks itself *"did we break anything?"* and waits for a `PROCEED` signal before reporting completion. No more silently broken builds.
- **Pre-commit / pre-PR gate.** A human-AI workflow asks the plugin *"is it safe to commit?"* between staging and pushing. The plugin replies with a structured decision.
- **Bundle-size and build-artifact drift.** A font loads twice, a CSS chunk balloons, build time creeps up — the plugin's mandatory build-artifact capture notices on every eval, alongside test deltas, not buried under them.
- **Multi-stack monorepos.** Backends in C#, frontends in Vue, jobs in Python, docs that lint — one protocol drives all of them. Tier discovery is grilling, not assumption.
- **CI/CD quality gates.** Wire the same signal format into a CI step. `STOP` blocks the deploy; `PROCEED` lets it through; `REVIEW` pings the team channel.
- **Greenfield onboarding.** Run `/test-baseline init` once on a fresh repo and let the agent grill you for the tier set — code or non-code, the protocol adapts.

## Quick start

```bash
# Initialize a baseline from current test results (run once)
/test-baseline init

# Later, check if you've broken anything
/test-baseline eval

# Ask a quality question
/regression-check "Did we break anything?"
```

The slash-command examples above work in OpenCode today. Under Claude Code, Codex, Cursor, or any other supported agent, invoke the same two skills by name (`test-baselining`, `regression-checking`) through your agent's skill loader — the skill bodies are identical regardless of the routing.

## What you get

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

```json
{
  "decision": "STOP",
  "status": "FAIL",
  "risk_level": "high",
  "violations": [
    { "metric": "coverage", "current": "78%", "baseline": "82%", "delta": "-4%", "threshold": "5%", "severity": "medium" },
    { "metric": "build_time", "current": "45s", "baseline": "38s", "delta": "+18%", "threshold": "10%", "severity": "high" }
  ],
  "approval_required": true,
  "next_actions": ["Fix failing tests", "Investigate coverage drop", "Re-run regression check"]
}
```

## Installation

Three install paths — pick whichever fits your workflow.

> The two skills (`test-baselining`, `regression-checking`) are agent-agnostic. Pick **any** install path that fits your agent — there's no OpenCode-specific lock-in.

### Option 1: `opencode.json` (OpenCode)

Add to `.opencode/opencode.json` in your project:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-auto-qcgates"]
}
```

OpenCode resolves the plugin from npm on next session start and runs the install (idempotent — `.version` markers keep it a no-op).

For local development against a checkout of this repo, reference the directory directly:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-auto-qcgates"]
}
```

### Option 2: `bunx` / `npx` (OpenCode)

```bash
bunx opencode-auto-qcgates install
# or
npx opencode-auto-qcgates install
```

Non-interactive by design — no prompts, CI-friendly. Writes a `.version` marker so subsequent runs are no-ops. Drops the skills into the dot-agents layout (`SKILL.md` per skill folder) — which OpenCode, Claude Code, and any other compatible agent pick up natively.

Install scope (`--scope local` is default; both forms below):

| Scope | Target |
|-------|--------|
| `local` (default) | `./.opencode/skills/` — this project |
| `global` | `~/.config/opencode/skills/` — every project |

Check / remove:

```bash
bunx opencode-auto-qcgates status
bunx opencode-auto-qcgates uninstall --scope local
```

### Option 3: `npx skills add` (any of 70+ agents)

The [skills.sh](https://skills.sh) CLI is the cross-agent installer — it hands the skills to OpenCode, Claude Code, Codex, Cursor, or any of [the supported agents](https://www.npmjs.com/package/skills#supported-agents). Install both skills in one shot:

```bash
npx skills add expert-vision-software/opencode-auto-qcgates \
  --skill test-baselining \
  --skill regression-checking
```

What each piece does:

| Part | Effect |
|------|--------|
| `npx skills add <owner>/<repo>` | Installs from the GitHub source shorthand |
| `--skill test-baselining --skill regression-checking` | Picks both published skills from the repo (the flag is repeatable; omit to install every skill) |
| `-a opencode` | Targets OpenCode; swap for `claude-code`, `codex`, `cursor`, or any of the other supported agents |
| `-y` | Skip confirmation prompts — CI/CD-friendly |

Install scope (default: project):

| Flag | Target |
|------|--------|
| *(none)* | `./<agent>/skills/` — this project |
| `-g` | `~/<agent>/skills/` — every project |

Full example — global install into Claude Code (non-interactive):

```bash
npx skills add expert-vision-software/opencode-auto-qcgates \
  --skill test-baselining --skill regression-checking \
  -a claude-code -g -y
```

The skills CLI mirrors the OpenCode plugin's install behaviour (no extra config, no auto-applied dependencies) and works under any supported agent — no OpenCode-specific quirks. To browse, search, update, or remove skills you installed via this path, see [`npx skills --help`](https://www.npmjs.com/package/skills).

## Commands

### `/test-baseline`

Test execution and baseline management.

| Subcommand | Description |
|------------|-------------|
| `eval` | Compare current tests against baseline (DEFAULT) |
| `init` | Grill for tiers, generate `testing-protocol.md`, capture first baseline (`BL-001`) |
| `update` | Update baseline when PASS and thresholds crossed |

### `/regression-check`

Quality regression detection — answers questions and emits decision signals for autonomous agents.

```bash
/regression-check                              # Full check (proactive or reactive)
/regression-check "Did we break anything?"     # Answer a specific quality question
/regression-check status                       # Quick check without a full eval
```

**Activation triggers:**
- **Proactive** — after agent task completion, before commit/push, when change surface exceeds a protocol-defined threshold.
- **Reactive** — "did we break anything?", "should I proceed or stop?", "is it safe to commit?", "should I continue or fix regressions first?".

## How it works

Two thin router-routed skills work together:

- **`test-baselining`** — Runs the actual work. Reads the consumer's `testing-protocol.md` for thresholds, executes each tier (build, tests, coverage, artefact capture), compares metrics against the baseline.
- **`regression-checking`** — Drives the decision layer. Loads `test-baselining`, interprets results through a risk lens, emits the human-readable narrative and the structured agent signal.

After the first `/test-baseline init`, two files appear at the consumer project root:

| File | Purpose |
|------|---------|
| `testing-baseline.xml` | Baseline metrics and changelog (`BL-001`, `BL-002`, …) |
| `testing-protocol.md` | Thresholds, pass/fail criteria, workflow — tailored to the consumer's tiers |

The protocol is the single source of truth for thresholds. The plugin never inline-copies a baseline.

### Threshold matrix (defaults — protocol overrides)

| Metric | Threshold | Direction |
|--------|-----------|-----------|
| Test count | > 10% change | Any |
| Pass rate | > 10% change | Any |
| Build time | > 10% increase | Up only |
| Coverage | > 5% change | Any |
| Test duration | > 20% increase | Up only |
| Artifact size | > 10% change | Any |

### Decision signals

| Decision | Trigger | Agent behaviour |
|----------|---------|----------------|
| **PROCEED** | PASS + no violations | Continue to next task or commit |
| **STOP** | FAIL + critical / high violations | Halt, await human approval |
| **REVIEW** | FAIL + medium / low violations, OR PASS + violations | Report and recommend specific fixes |

## Why this plugin?

- **Works with what you already run** — any test framework, any language, any source control. Tier discovery is grilling; the protocol is the truth.
- **Decision signals, not just numbers** — structured `PROCEED` / `STOP` / `REVIEW` JSON lets agents act autonomously or pause for human approval.
- **Build artefacts are first-class** — file count, total MB, gzipped KB on critical files, build time, lint-warning categories. Captured on every eval and surfaced alongside test deltas.
- **Local-first** — Global installable; local projects override settings without conflicts. `.version` markers keep reinstalls idempotent.
- **Zero overhead when idle** — Skill metadata loads at startup; full body loads only when the agent decides the skill is relevant.
- **Open & cross-agent** — agent-agnostic skill bodies; OpenCode-specific bindings layered as a thin tail in each `SKILL.md`.

## Architecture

The plugin is project-type, source-control, and language agnostic:

- **Tiers.** Discovered during `init` by grilling the user — backend, frontend, scripts, docs, schemas, anything with a repeatable verification procedure. Non-code repos are first-class.
- **Source controls.** Discovery lookup table in `assets/skills/test-baselining/refs/source-controls.md` — Git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS** (Unity Version Control / Plastic SCM), Perforce, Bazaar, Darcs. The skill body never assumes git; the lookup table is consulted for the consumer's actual source control.
- **Backend toolchains.** C#, JVM, Go, Rust, Python, Node, Elixir, Erlang, Haskell, Scala, C++ — listed in `refs/backends-ref.md` (init-only guidance, never overrides the protocol).
- **Frontend stacks.** React, Vue, Svelte, Angular, Solid, **Aurelia 2**, Lit, Ember, HTMX, … — listed in `refs/frontend-refs.md` (init-only guidance).
- **Build artifacts.** Captured per-tier (file count, total MB, gzipped KB on critical files, build time, lint-warning categories) on every eval and written into every baseline update. They live alongside test deltas — never buried.
- **Aurelia detection.** The installer reads `package.json`, detects `aurelia` / `aureliajs` / `@aurelia/*` / `aurelia-bootstrapper` / `aurelia-framework` across `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, and prints a non-blocking recommendation on install (the installer never modifies the consumer config autonomously). The recommendation names the OpenCode plugin path *and* the `npx skills add` fallback for non-OpenCode agents.

See `AGENTS.md` for full developer documentation and `CONTRIBUTING.md` for the file layout and authoring conventions.

## Requirements

| Component | Notes |
|-----------|-------|
| **[Bun](https://bun.sh) ≥ 1.0** | Required for the CLI installer, test suite, and OpenCode plugin runtime. |
| **OpenCode, Claude Code, or any skill-compatible agent** | The skills surface in the agent's `<available_skills>` list once installed. |
| **A project** *(optional)* | The plugin only needs a `package.json` to detect Aurelia; otherwise it works on any repo, code or not. |

## Local development

```bash
git clone https://github.com/Expert-Vision-Software/opencode-auto-qcgates.git
cd opencode-auto-qcgates
bun install
bun run check   # TypeScript type check
bun test        # Run unit tests
bunx . install --scope local   # Smoke-test the CLI against the local checkout
```

`prepublishOnly` runs `bun run check && bun test` automatically before any `npm publish`. The CI release workflow (`.github/workflows/release.yml`) extracts release notes from `CHANGELOG.md`, creates a GitHub Release, then runs `npm publish --provenance --access public` (requires the `NPM_TOKEN` secret and `id-token: write` permission for provenance).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the file layout, architecture decisions, and authoring conventions.

## Acknowledgments

- [OpenCode](https://opencode.ai) — plugin architecture, skill loader, config schema.
- [skills.sh](https://skills.sh) — cross-agent skill installation conventions.
- The open-source community — for testing frameworks, coverage tools, and CI/CD best practices.

---

<div align="center">

**[📦 Install from npm](https://www.npmjs.com/package/opencode-auto-qcgates)** · **[🤝 Contribute](CONTRIBUTING.md)** · **[📄 License](LICENSE)**

</div>
