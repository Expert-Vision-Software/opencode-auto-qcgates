# Draft upstream issue — OpenCode blocks startup when a plugin `config` hook rejects

> **Status: DRAFT — do not file without owner approval.**

## Summary

When a plugin's `config` hook rejects (or the plugin's npm-install join hangs), OpenCode blocks
startup indefinitely: no timeout, no error UI, no fallback to a plugin-free session. The user must
kill the shell. A single partially-extracted plugin cache artifact can therefore dead-end the entire
application.

## Observed behavior

1. Plugin registered via the config `plugin` array is imported at startup; failed imports are
   permanent for the process, with no retry or skip-and-continue.
2. `packages/opencode/src/plugin/index.ts` awaits dependency installation via an unbounded
   `Promise.join`-style join (`waitForDependencies`) — no timeout.
3. `plugin/loader.ts` awaits the plugin hook chain with no timeout; a rejection propagates into
   config assembly and stalls startup.
4. `core/src/npm.ts` reuses `~/.cache/opencode/packages/<spec>/node_modules/<name>` forever. A
   partial extraction (e.g. missing bundled content directories `skills/` / `commands/`) is never re-fetched, so a plugin whose hook
   validates its own integrity throws on every start — and per (2–3) that throw hangs startup.

## Reproduction (with opencode-auto-qcgates v1.5.0)

1. Corrupt the cache: delete `skills/` and `commands/` inside
   `~/.cache/opencode/packages/opencode-auto-qcgates@1.5.0/node_modules/opencode-auto-qcgates/`.
2. Register the package in the global config: `{ "plugin": ["opencode-auto-qcgates@1.5.0"] }`.
   The `1.5.0` pin is historical to this reproduction; current registrations use the canonical
   `opencode-auto-qcgates@latest`.
3. Start `opencode`. The plugin's `config` hook throws "Package assets not found …"; startup hangs
   with no UI escape; the user must kill the shell.

## Expected behavior

- A rejecting or hanging plugin hook must not block startup unboundedly: apply a timeout, catch the
  rejection, log it, and continue loading remaining plugins (or start plugin-free).
- Detect and re-fetch partial/corrupt cache artifacts instead of reusing them forever.

## Suggested remediations (OpenCode side)

1. Bound `waitForDependencies` and hook execution with a timeout; on expiry, skip the plugin with a
   visible warning.
2. Isolate plugin failures: one plugin's import/hook error must not prevent other plugins or core
   startup.
3. Validate cache artifacts on reuse (expected files/manifest present); re-install on mismatch, or
   provide a documented `opencode` command to purge the plugin cache.

## Downstream mitigation already shipped (this plugin)

`opencode-auto-qcgates` wraps its `config` hook body in try/catch and degrades any failure to a warn
log + toast naming the exact remediation (`bunx opencode-auto-qcgates install --scope global`;
for corrupt cache, `bunx opencode-auto-qcgates clear-cache` and restart, naming the
`~/.cache/opencode/packages/<name>@<version>` directory to clear). See
`docs/adr/0007-startup-non-interference-never-throw-from-hooks.md`. The hang can still occur for
plugins that do not defend this way, hence this upstream report.
