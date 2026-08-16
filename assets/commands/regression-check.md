---
description: Regression check workflow. Routes to the explore subagent; answers "did we break anything?", "should I proceed or stop?", "is it safe to commit?".
agent: explore
subtask: true
---

Load the regression-checking skill and answer the quality question.

```
!`tool loadSkill({ name: "regression-checking" })`
```

The skill emits a structured decision signal (`PROCEED` / `STOP` / `REVIEW`) and a human-readable narrative.

Argument: `$ARGUMENTS` — default behavior runs a fresh eval if the cached result is stale.

| Subcommand | Purpose |
|------------|---------|
| (none) | Full check: decide if a fresh eval is needed, run it, interpret results. |
| `status` | Quick check without a full eval — reuse last results if recent enough. |

Usage:

```
/regression-check         # full check (proactive or reactive based on context)
/regression-check status  # quick status without full eval
```

Reactive triggers: "did we break anything?", "should I proceed or stop?", "is it safe to commit?", "should I accept these changes?", "has quality improved or degraded?", "should I continue or fix regressions first?".

The skill is agent-agnostic at the body level; the `agent: explore` / `subtask: true` frontmatter above is OpenCode-specific binding. Other dot-agents agents see the command body and route it however their loader requires.