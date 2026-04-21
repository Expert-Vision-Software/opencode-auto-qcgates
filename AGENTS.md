# opencode-auto-qcgates

OpenCode plugin for automated quality gate evaluation via test baselining.

## Developer Commands

```bash
bun run check   # TypeScript type check (may show tsconfig warnings in dev env)
bun test        # Run unit tests
```

## Commands

| Command | Description |
|---------|-------------|
| `/test-baseline init` | Create initial baseline from current test results |
| `/test-baseline eval` | Compare current tests against baseline (DEFAULT) |
| `/test-baseline update` | Update baseline if PASS + thresholds exceeded |
| `/regression-check` | Answer quality questions (proactive or reactive) |

## Architecture

**Two-skill system:**
- `test-baselining` — Runs tests, captures metrics, compares against baseline
- `regression-checking` — Interprets results, answers quality questions, emits decision signals for agents

**Asset structure:**
```
assets/skills/test-baselining/
├── SKILL.md
└── templates/
    ├── testing-baseline.xml   # Baseline XML template (copied on init)
    └── testing-protocol.md     # Threshold/pass-fail criteria (copied on init)

assets/skills/regression-checking/
└── SKILL.md                   # Loads test-baselining, reads protocol for thresholds

assets/commands/
├── test-baseline.md
└── regression-check.md
```

**Plugin flow:** `plugin.ts` → `src/installer.ts` copies all assets to `.opencode/` on first load.

## Consumer Project Files

After `/test-baseline init`, these files appear at the consumer project root:

| File | Purpose |
|------|---------|
| `testing-baseline.xml` | Baseline metrics + changelog (BL-001, BL-002, ...) |
| `testing-protocol.md` | Thresholds, pass/fail criteria, workflow |

## Adding Commands or Skills

**New command:** Create `assets/commands/<name>.md` with frontmatter `agent: explore`. The command typically loads the corresponding skill.

**New skill:** Create `assets/skills/<name>/SKILL.md` with required frontmatter (`name`, `description`). Use `templates/` subdirectory for files that should be copied to consumer projects.

**Skill reference pattern:**
```markdown
!`tool loadSkill({ name: "skill-name" })`
```

## Key Conventions

- Baseline markers use `BL-NNN` format (zero-padded, e.g., `BL-001`)
- Changelog auto-generates summaries based on which thresholds were exceeded
- `regression-checking` delegates to `test-baselining` and reads `testing-protocol.md` for threshold interpretation
- Commands route to explore subagent by default (clean isolation)