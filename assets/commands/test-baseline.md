---
description: Test baselining workflow (init|eval|update). Routes to the explore subagent; defaults to eval.
agent: explore
subtask: true
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
| `eval` | Compare current execution against the existing baseline using the protocol's thresholds and pass/fail criteria. **Default.** |
| `update` | Update the baseline only when the current run is PASS **and** a threshold is exceeded. Increments the baseline marker (`BL-NNN` → `BL-NNN+1`). |

Usage:

```
/test-baseline eval     # default — evaluate against baseline
/test-baseline init     # grill for tiers, generate protocol, capture baseline
/test-baseline update   # conditionally refresh the baseline
```

The skill is agent-agnostic at the body level; the `agent: explore` / `subtask: true` frontmatter above is OpenCode-specific binding. Other dot-agents agents see the command body and route it however their loader requires.