---
name: regression-checking
description: Quality regression detection for autonomous agents and human reviewers. Use when answering "did we break anything?", "should I proceed or stop?", or "is it safe to commit?". Interprets test-baselining results against baseline; emits PROCEED / STOP / REVIEW decision signals for agents.
---

# Regression Checking

A decision-support skill that interprets `test-baselining` results to answer quality regression questions for both humans and autonomous agents. Body is agent-agnostic; OpenCode-specific bindings are noted in the last section.

## Purpose

Provides quality-regression intelligence on top of `test-baselining`:

- Answer quality questions in plain language: "Did we break anything?", "Is it safe to proceed?", "Should I commit?"
- Guide autonomous agents with structured decision signals: `PROCEED` / `STOP` / `REVIEW`
- Translate metric deltas into risk assessments humans can scan
- Enable self-evaluation: agents check themselves before declaring a task complete

## Context Reuse

This skill **does not run tests directly**. It loads `test-baselining` for execution and reads the consumer's `testing-protocol.md` for thresholds.

Loading the upstream skill is the agent's own mechanism (e.g. `loadSkill({ name: "test-baselining" })` on OpenCode, the equivalent on Claude Code or other dot-agents agents). The body assumes it is loaded; it does not assume any specific loader syntax.

## Activation Triggers

### Proactive

- After an agent task completes: run the regression check before reporting done.
- Before commit / push: verify quality before proposing changes.
- On large change detection: when the change surface exceeds a protocol-defined threshold.

### Reactive

These question patterns activate the skill:

| Question | Intent |
|----------|--------|
| "Did we break anything?" | Detect regressions |
| "Should I proceed or stop?" | Agent decision guidance |
| "Is it safe to commit?" | Pre-commit quality check |
| "Should I accept these changes?" | Human review support |
| "Has quality improved or degraded?" | Trend analysis |
| "Is the quality decrease worth keeping the latest changes?" | Trade-off evaluation |
| "Should I tell the agent to continue?" | Agent oversight |
| "Should I continue or fix regressions first?" | Decision routing |

## Execution Flow

```
1. Determine if a fresh eval is needed
   ├─ Check git diff since the last eval
   ├─ If no changes → reuse cached results
   └─ If changes exist → run test-baselining eval

2. Load test-baselining (via the agent's skill loader) and run `eval`

3. Read testing-protocol.md for thresholds and pass/fail criteria
   - Use the location rules from test-baselining's "Locating the Consumer Files"

4. Interpret results through the risk lens:
   ├─ Parse PASS / FAIL using pass_fail_criteria
   ├─ Analyze threshold deltas against baseline_thresholds
   ├─ Map deltas to risk levels
   └─ Identify specific violations

5. Emit:
   ├─ Human-readable quality narrative
   └─ Structured agent decision signal
```

## Caching Logic

To avoid unnecessary test runs:

| Scenario | Action |
|----------|--------|
| No git changes since last eval | Reuse last eval results |
| Untracked / changed files exist | Run fresh eval |
| Baseline file missing | Prompt to run `test-baselining init` |
| Eval older than 1 hour | Run fresh eval (staleness check) |

## Decision Output

### Human-Readable Narrative

```
Regression Check: PASS (with caveats) / FAIL / PASS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test Results: 147 passed, 3 failed
Coverage: 78% (baseline: 82%) — -4% ▼
Build time: 45s (baseline: 38s) — +18% ▲▲

Threshold Violations:
• Frontend coverage dropped 5% (threshold: 5%) — AT LIMIT
• Build time increased 18% (threshold: 10%) — EXCEEDED

Risk Assessment: MEDIUM
Some metrics exceeded threshold. Review recommended before proceeding.

Recommendation: REVIEW — Fix test failures and address coverage drop.
Do not commit until status is PASS.
```

### Structured Agent Signal

```
{
  "decision": "REVIEW",     // PROCEED | STOP | REVIEW
  "status": "FAIL",         // PASS | FAIL
  "summary": "3 tests failed, coverage dropped 4%, build time +18%",
  "violations": [
    { "metric": "coverage", "current": "78%", "baseline": "82%", "delta": "-4%", "threshold": "5%", "severity": "medium" },
    { "metric": "build_time", "current": "45s", "baseline": "38s", "delta": "+18%", "threshold": "10%", "severity": "high" }
  ],
  "risk_level": "medium",   // low | medium | high | critical
  "approval_required": true,
  "next_actions": [
    "Fix failing tests",
    "Investigate coverage drop",
    "Re-run regression check after fixes"
  ]
}
```

### Decision Definitions

| Decision | Trigger | Agent behavior |
|----------|---------|----------------|
| **PROCEED** | PASS + no violations + low risk | Continue to next task or commit |
| **STOP** | FAIL + critical / high violations | Halt, report, await human approval |
| **REVIEW** | FAIL + medium / low violations, OR PASS + violations | Report and recommend specific fixes |

### Risk Level Mapping

| Condition | Risk |
|-----------|------|
| PASS + no violations | low |
| PASS + minor violations | medium |
| FAIL + test failures | high |
| FAIL + test failures + multiple violations | critical |

## Quality Narrative Format

Present information in this order:

1. **Status badge** — PASS / FAIL / REVIEW
2. **Test summary** — counts, pass rate
3. **Key metric deltas** — coverage, build time, duration
4. **Threshold violations** — specific metrics that exceeded limits
5. **Risk assessment** — one-line summary
6. **Recommendation** — clear action statement

Use visual indicators:
- ✓ for improvements within threshold
- ▼ / ▲ for negative / positive deltas
- ▲▲ for exceeded thresholds

## Protocol File Reference

`testing-protocol.md` at the consumer project root drives regression decisions. The location rules from `test-baselining`'s **Locating the Consumer Files** apply — read them once and follow.

| Section | Usage |
|---------|-------|
| `pass_fail_criteria` | Determine what counts as PASS vs FAIL per tier |
| `baseline_thresholds` | Map metric deltas to threshold violations |
| `decision_matrix` | Map baseline state transitions to update decisions |

## OpenCode

OpenCode-specific bindings for this skill:

- **Slash command** — `/regression-check` (or `/regression-check status` for a quick check without a full eval) routes through the `explore` agent with `subtask: true`. The command body loads this skill via the `loadSkill` tool.
- **Skill allowlist** — `plugin.ts` sets `agent.explore.permission.skill["regression-checking"] = "allow"` so the explore subagent can reach this skill without a prompt.
- **Skill chain** — OpenCode's `loadSkill({ name: "test-baselining" })` call inside this skill reuses the same install location and permission allowlist, so the chain works without extra config.
- **Install layout** — OpenCode's plugin harness copies this skill to `.opencode/skills/regression-checking/` (project) or `~/.config/opencode/skills/regression-checking/` (global). A `.version` marker drives idempotent reinstalls.

For non-OpenCode agents (Claude Code, etc.), the same `SKILL.md` works — frontmatter fields OpenCode adds are ignored, and the agent's own skill loader handles loading `test-baselining`.