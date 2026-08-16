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
├── refs/                      # Bundled reference assets — non-authoritative guidance
│   ├── source-controls.md     # Always-relevant: VCS discovery + change-detection commands (git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS**, Perforce, Bazaar, Darcs)
│   ├── backends-ref.md        # Init-only: backend-toolchain map and tier-grill scaffolding (C#, JVM, Go, Rust, Python, Node, Elixir, …)
│   └── frontend-refs.md       # Init-only: frontend-stack map and tier-grill scaffolding (React, Vue, Svelte, Angular, Solid, **Aurelia 2**, Lit, Ember, HTMX, …)
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

**File-location rule:** skills locate these files at the consumer's source-control working-tree root, falling back to cwd. The VCS-agnostic lookup table lives in `refs/source-controls.md` (bundled with `test-baselining`). Never invent a path; warn if found elsewhere (e.g. a monorepo subpackage or a Unity `Packages/com.<vendor>.<name>/`).

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
- Changelog auto-generates summaries based on which thresholds were exceeded — **build-artifact deltas are first-class in the summary, never buried under test deltas**
- `regression-checking` delegates to `test-baselining` and reads `testing-protocol.md` for threshold interpretation
- Commands route to the explore subagent by default (clean isolation; OpenCode-only — other agents use their own routing)
- Skill bodies are agent-agnostic; OpenCode bindings live in a tail section per skill
- **`refs/` is reference, not policy.** Files under `assets/skills/<name>/refs/` are bundled with the skill and copied to the consumer; the skill body consults them during guided flows (`init`, `Locating the Consumer Files`, `Caching Logic`) but they are explicitly *non-authoritative* — the consumer's `testing-protocol.md` is the truth once it is written. `source-controls.md` is always-relevant; `backends-ref.md` and `frontend-refs.md` are init-only.
- **Skills are VCS-agnostic at the body level.** Git-specific wording is a stand-in; the lookup table lives in `refs/source-controls.md` and the agent consults it for the consumer's actual source control. Coverage: Git, Mercurial, Subversion, Pijul, Fossil, **Unity VCS** (Unity Version Control / Plastic SCM), Perforce, Bazaar, Darcs.
- **Skills are backend-language and frontend-framework agnostic at the body level.** Stack-specific guidance lives in `refs/backends-ref.md` and `refs/frontend-refs.md` and is used only during `init` — once the user configures their protocol, the references have no bearing.
- **Build artifacts are part of every eval and update.** Captured per-tier (file count, total MB, build time, gzipped KB on critical files, lint-warning categories) in Stage 1, surfaced alongside test deltas in the eval output, and required for any `update` write — a baseline update that drops artefact fields is invalid.
- **Installer recommendations are non-blocking.** The installer (`src/installer.ts#detectAurelia`) appends advisory messages to `InstallResult.recommendations` after a successful install when a known stack is detected (currently: Aurelia). The recommendation suggests the right install path for the consumer's agent (OpenCode plugin config or `npx skills add`) but never modifies the consumer config autonomously.

## Agent skills

### Issue tracker

Issues live as GitHub issues; use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.