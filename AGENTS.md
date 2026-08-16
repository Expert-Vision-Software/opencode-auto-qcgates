# opencode-auto-qcgates

OpenCode plugin for automated quality gate evaluation via test baselining. Ships two skills and two slash commands for use under any dot-agents-compatible agent (Claude Code, OpenCode, etc.); OpenCode-specific bindings are layered on top.

## Developer Commands

```bash
bun run check   # TypeScript type check (may show tsconfig warnings in dev env)
bun test        # Run unit tests
```

## Commands

| Command | Description |
|---------|-------------|
| `/test-baseline init` | Grill for tiers, generate `testing-protocol.md`, capture first baseline (`BL-001`) |
| `/test-baseline eval` | Compare current tests against baseline (DEFAULT) |
| `/test-baseline update` | Update baseline if PASS + thresholds exceeded |
| `/regression-check` | Answer quality questions (proactive or reactive) |

## Architecture

**Two-skill system:**
- `test-baselining` — Runs tests, captures metrics, compares against baseline; builds the consumer's protocol + baseline on `init`
- `regression-checking` — Interprets results, answers quality questions, emits decision signals for agents

**Asset structure:**
```
assets/skills/test-baselining/
├── SKILL.md
└── templates/
    ├── testing-baseline.xml   # Baseline XML template (adapted to consumer tiers on init)
    └── testing-protocol.md     # Threshold/pass-fail criteria template (tailored on init)

assets/skills/regression-checking/
└── SKILL.md                   # Loads test-baselining, reads protocol for thresholds

assets/commands/
├── test-baseline.md
└── regression-check.md
```

**Install model — dot-agents universal, OpenCode-extras on top:**

- **Universal install** — `plugin.ts` → `src/installer.ts` copies skills, commands, and agents to a dot-agents layout (`SKILL.md` per skill folder). Other agents consume them directly.
- **OpenCode accommodation** — The harness additionally registers the plugin in `opencode.json`, sets the `agent.explore.permission.skill` allowlist for both skills, and migrates a root `opencode.json` to `.opencode/opencode.json` when present. OpenCode's `loadSkill({ name })` tool resolves skills through the same layout.

Skill bodies stay agent-agnostic. OpenCode-specific bindings live in a tail section of each `SKILL.md` and in the command frontmatter (`agent: explore`, `subtask: true`).

## Consumer Project Files

After `/test-baseline init`, two files appear at the consumer project root:

| File | Purpose |
|------|---------|
| `testing-protocol.md` | Workflow stages, thresholds, pass/fail criteria — **tailored to this consumer's tiers** (code or non-code) |
| `testing-baseline.xml` | Baseline metrics and changelog (`BL-001`, `BL-002`, …) |

`init` grills the user for the actual tier set (code: toolchain per tier; non-code: repeatable verification procedures) and adapts both files to match. The shipped XML/Protocol templates are starting points, not the protocol.

**File-location rule:** skills locate these files at the git working-tree root, falling back to cwd. Never invent a path; warn if found elsewhere.

## Adding Commands or Skills

**New command:** Create `assets/commands/<name>.md` with frontmatter `agent: explore` and `subtask: true` (OpenCode-specific — ignored by other agents). The body typically loads the corresponding skill.

**New skill:** Create `assets/skills/<name>/SKILL.md` with required frontmatter (`name`, `description`). Use a `templates/` subdirectory for files that should be copied to consumer projects. Body must be agent-agnostic; put any OpenCode-specific bindings in a tail `## OpenCode` section.

**Skill reference pattern:**
```markdown
!`tool loadSkill({ name: "skill-name" })`
```

## Key Conventions

- Baseline markers use `BL-NNN` format (zero-padded, e.g., `BL-001`)
- Changelog is append-only and FIFO-pruned to 10 entries
- Changelog auto-generates summaries based on which thresholds were exceeded
- `regression-checking` delegates to `test-baselining` and reads `testing-protocol.md` for threshold interpretation
- Commands route to the explore subagent by default (clean isolation; OpenCode-only — other agents use their own routing)
- Skill bodies are agent-agnostic; OpenCode bindings live in a tail section per skill

## Agent skills

### Issue tracker

Issues live as GitHub issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.