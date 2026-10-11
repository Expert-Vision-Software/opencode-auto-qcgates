---
description: "Test baselining workflow (init|eval|update). Runs in the main conversation; defaults to eval."
subtask: false
---

Load the test-baselining skill and execute the requested subcommand.

```
!`tool loadSkill({ name: "test-baselining" })`
```

Argument: `$ARGUMENTS` — defaults to `eval` if not specified.

Available subcommands:

| Subcommand | Purpose |
|------------|---------|
| `init` | Build the consumer's `testing-protocol.md` and `testing-baseline.xml` from the actual tiers, then capture the first baseline as `BL-001`. Grills the user for tiers first (code: toolchain per tier; non-code: repeatable verification procedures). |
| `eval` | Compare current execution against the existing baseline using the protocol's thresholds and pass/fail criteria, then **auto-update the baseline in the same run when the result is PASS and a threshold is exceeded** — reusing the metrics just captured, never re-executing the build or tests. **Default.** |
| `update` | Manual escape hatch: re-baseline on explicit request — accept a FAIL's genuinely-moved metrics, force a fresh baseline, or approve numbers the user inspected. Always requires captured build-artifact metrics. Increments the baseline marker (`BL-NNN` → `BL-NNN+1`). |

Usage:

```
/test-baseline eval     # default — evaluate; auto-updates the baseline on PASS + threshold
/test-baseline init     # grill for tiers, generate protocol, capture baseline
/test-baseline update   # manual escape hatch — re-baseline on request (accept a FAIL, force fresh)
```

The skill is agent-agnostic at the body level; the `subtask: false` frontmatter above is OpenCode-specific binding — it keeps the command in the current agent's main conversation instead of spawning a subagent, so the eval's captured metrics stay in context through its inline baseline update. Other dot-agents agents see the command body and route it however their loader requires.