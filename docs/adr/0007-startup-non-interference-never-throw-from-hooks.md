# Startup non-interference: never throw from hooks

OpenCode awaits a plugin's `config` hook during config assembly with no timeout and no UI escape; a rejection (or a hanging npm-install join) stalls startup until the user kills the shell. We therefore treat every hook as advisory-only: the `config` hook wraps its body in try/catch and degrades any failure — including a missing/rotted package cache — to a warn log plus a toast that names the exact remediation (`bunx … install` and the `~/.cache/opencode/packages/<name>@<version>` directory to clear). Hard errors remain CLI-only. We do not auto-delete the rotted cache from the hook: deletion races OpenCode's in-flight installs, so the hook only instructs; a CLI-side auto-clean is a possible follow-up.

## Considered options

- **Let hooks throw** — rejected: a single rotted cache artifact dead-ends the user's entire session with no escape.
- **Auto-heal from the hook (delete cache, reinstall)** — rejected for the deletion half: races in-flight OpenCode installs. Reinstall only is safe but cannot succeed when the cache artifact lacks bundled assets.

## Consequences

- A plugin in a degraded state never blocks startup; the user sees an actionable advisory instead.
- Skill/command availability is best-effort when the package itself is broken — the toast is the contract.
