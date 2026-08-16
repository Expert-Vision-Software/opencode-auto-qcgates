# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring, extending, or authoring in it.

## Repo orientation

`opencode-auto-qcgates` is a Bun-native, npm-distributed plugin that ships two skills (`test-baselining`, `regression-checking`) and two slash commands (`/test-baseline`, `/regression-check`) into consumer projects, where they evaluate test results against a frozen baseline and emit decision signals. The plugin targets any dot-agents-compatible agent; OpenCode gets extra polish layered on top.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the glossary. Read it before using any domain term in issues, PRs, code, or tests.
- **`AGENTS.md`** at the repo root — the project's authoring conventions: install model, asset layout, command/skill patterns, harness-vs-assets split, key conventions.
- **`CHANGELOG.md`** — release notes per version. Use this to ground any "is this already done?" question.
- **`docs/adr/`** — currently empty. No architectural decision has met the three-criteria bar (hard to reverse, surprising without context, real trade-off) yet. Do not invent ADRs proactively; the `/domain-modeling` skill creates them lazily when a decision crystallises.

If you are about to do something that touches one of these files, read the file first.

## What lives where

```
harness (TypeScript)                  agent-facing material (markdown)
─────────────────                     ──────────────────────────────
plugin.ts                             assets/skills/<name>/SKILL.md
index.ts                              assets/commands/<name>.md
src/cli.ts                            assets/skills/<name>/templates/  ← copied to consumer
src/installer.ts                      docs/agents/*.md                  ← repo-local skill wiring
src/commands/                         CHANGELOG.md
src/prompts.ts                        AGENTS.md
tests/                                CONTEXT.md
.github/workflows/release.yml
```

A change belongs on the **harness** side when it shifts the install mechanic, plugin registration, scope resolution, or command-line CLI. It belongs on the **assets** side when it shifts what an agent reads when running the skill. Edit the wrong side and either nothing happens (asset change, harness was the gate) or the agent reads the wrong thing (harness change, asset was the gate).

## Authoring rules (when extending)

These are the load-bearing conventions. Read `AGENTS.md` for the full list; these are the ones that bite if missed.

- **Skill body stays agent-agnostic.** No OpenCode-only tools, no `loadSkill({...})` syntax, no agent-specific permission keys. OpenCode-specific bindings live in a tail `## OpenCode` section per skill.
- **Slash-command frontmatter (`agent: explore`, `subtask: true`) is OpenCode-specific.** Other dot-agents agents ignore it. Don't put agent-routing logic in the command body.
- **Skill reference pattern** (inside a skill or command that wants to reach another skill): describe the loader as `the agent's skill loader`, not as a specific tool. Each agent's body resolves it natively.
- **`init` grills the consumer.** Tier discovery is grilling, not assumption. Never hard-code "backend = dotnet, frontend = npm" — the consumer's `testing-protocol.md` is the truth.
- **Non-code repos are first-class.** Document repos, configs, data — anything with a repeatable verification procedure. Tiers become document classes; tests become validators.
- **Templates are placeholders.** `templates/testing-protocol.md` and `templates/testing-baseline.xml` ship as starting points. The consumer's adapted versions are the live source; the skill body must not assume the template's structure.
- **Changelog is append-only.** Never edit prior `<Entry>` blocks in a consumer's `testing-baseline.xml`; only append. Same for this repo's `CHANGELOG.md` between releases.
- **Threshold matrix in the skill body is a seed.** The protocol's `baseline_thresholds` table is the live source. Defaults exist only to populate an empty protocol.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## File-location rule (consumer projects)

When a skill runs inside a consumer project, it locates `testing-protocol.md` and `testing-baseline.xml` deterministically: project root (the directory containing `.git/`) → cwd → stop-and-ask. Never invent a path. Warn when the files are found in a non-root location (monorepo subpackage) since thresholds may not match the outer project.

## Flag conflicts with existing docs

If your output contradicts `CONTEXT.md`, `AGENTS.md`, or `CHANGELOG.md`, surface it explicitly rather than silently overriding:

> _Contradicts `CONTEXT.md`'s definition of Threshold (which is X) — worth reopening because…_

> _Contradicts `AGENTS.md`'s install model (which says Y) — worth revisiting because…_

`docs/adr/` has no entries yet. If your change introduces a hard-to-reverse, surprising, real-trade-off decision, propose an ADR via `/domain-modeling`; otherwise record it inline in `AGENTS.md` or `CHANGELOG.md` and move on.