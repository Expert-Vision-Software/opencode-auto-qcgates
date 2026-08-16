# Frontends — Init-Time Reference

> **Scope:** init-time only. Once the consumer's `testing-protocol.md` is written and configured, **this file has no further bearing**. The protocol is the single source of truth for that project's tiers, toolchain, thresholds, and pass/fail criteria.
> **When to consult:** Step 2 of `/test-baseline init` (tier discovery) when the project has a UI tier. Use it to ask better questions and seed better defaults — not to override what the user tells you.
> **Authority rule:** never copy a framework's toolchain into the protocol without confirming with the user. Each project picks its own stack.

The skills are frontend-framework agnostic at the body level. This reference exists so the agent has a quick checklist of likely tier dimensions and a toolchain map per popular UI stack — so `/test-baseline init` produces a richer protocol in fewer turns.

## Frontend tiers to ask about

Grill in this order. Each named tier becomes a `<stage>` and an XML block.

| Tier | What it is | Likely choice |
|------|-----------|---------------|
| **Component / View-model** | Single-component rendering, bindings, lifecycle | Framework testing harness |
| **Unit / Domain logic** | Reducers, stores, computed values, pure helpers | Vitest / Jest |
| **Integration / E2E** | Browser, user flows, screen-reader checks | Playwright / Cypress |
| **Visual regression** | Screenshot diffs, design-token checks | Playwright `toHaveScreenshot()` / Chromatic |
| **Accessibility (a11y)** | axe / jest-axe / pa11y runs | axe-core integration |
| **Performance / Bundle** | Bundle size budget, First Contentful Paint, Lighthouse | `bundlesize` / `size-limit` / Lighthouse CI |
| **Storybook / Catalogue** | Story-only tests, MDX, controls | Storybook test-runner |
| **Documents** (if the project also publishes docs) | Markdown, MDX, JSDoc | remark / lint-md / typedoc |

If the project has no UI tier (library-only, headless API, BFF), skip this file and consult `backends-ref.md`.

## Frontend framework map (popular stacks)

Each row maps a framework to the test trio the agent should suggest. Confirm with the user before pinning. **Cross-cutting rule:** for any framework that already ships an OpenCode skill pack, mention it; don't auto-install.

| Framework | Unit | Component | E2E | Expert skill pack (advisory, never auto-installed) |
|-----------|------|-----------|-----|--------------------------------------------------|
| **React** | Vitest / Jest | Testing Library | Playwright / Cypress | — |
| **Vue 3** | Vitest | Vue Test Utils | Playwright / Cypress | — |
| **Solid** | Vitest | `@solidjs/testing-library` | Playwright | — |
| **Svelte / SvelteKit** | Vitest | `@testing-library/svelte` | Playwright | — |
| **Angular** | Jest / Karma | Angular Testing (TestBed) | Playwright / Cypress | — |
| **Qwik** | Vitest | `@builder.io/qwik/testing` | Playwright | — |
| **Lit** | Vitest / Web Test Runner | `@open-wc/testing` | Playwright | — |
| **Aurelia 2** | Vitest | `@aurelia/testing` | Playwright | [`aurelia-expert`](https://www.npmjs.com/package/aurelia-expert) — suggested during install, never auto-installed; see the installer's aurelia detection. |
| **Ember** | QUnit | built-in `ember test` (uses `qunit` + `@ember/test-helpers`) | Playwright | — |
| **Alpine.js** | Vitest | `@testing-library/dom` | Playwright | — |
| **HTMX / server-rendered** | — (assert via HTML responses in the E2E tier) | — | Playwright | — |
| **Static / Web Components** | Vitest / Web Test Runner | `@open-wc/testing` | Playwright | — |

> **Aurelia 2 special-case:** the **installer** (Bun CLI in this repo) detects `aurelia` in `package.json` dependencies and prints a recommendation pointing at `aurelia-expert`. That's a one-time hint during `install`, not a behaviour of these skills. Re-running `/test-baseline init` later does not re-suggest it.

## Questions to grill the user (suggested order)

1. **Single framework or mixed?** (Mixed: e.g. Astro with React islands, or Vue host + Solid widget.)
2. **Render layer — SPA / SSR / SSG / hybrid?** (Affects the E2E tier — SSR needs a server fixture.)
3. **Strict component isolation, or default to integration tests?** (Tells us where the test budget sits.)
4. **Coverage threshold per UI tier?** (Conventional: components ≥ 80%, unit ≥ 90%.)
5. **Bundle budget?** (Per-route, per-component, global.) Confirm the published artefact directory.
6. **Accessibility target?** (WCAG 2.1 AA? Section 508?) Picks the rule pack.
7. **Internationalisation?** (i18next, FormatJS, Paraglide JS, Lingui) Affects the test matrix.
8. **Design system?** (Internal library, Tailwind UI, shadcn, Material, etc.) If internal — does it ship its own components tier?
9. **Storybook or external catalogue?** (test-runner integration yes/no.)
10. **Build tool?** (Vite, Webpack, Turbopack, Rspack, esbuild, ROLLUP, Rollup-only, Bun) — pinned toolchain affects build-time metric capture.

## Build artifact capture (always part of baseline)

**This is mandatory for every frontend tier.** The protocol's `<BuildArtifacts>` block per UI tier records:

- `OutputDirectory` — canonical name (`dist/`, `build/`, `.next/`, `.svelte-kit/output/`, `storybook-static/`, `out/`)
- `FileCount` — number of files produced (often huge — record, but watch the upper-bound on `Timeout`)
- `TotalSizeMB` — sum of file sizes (uncompressed)
- **Critical-file fingerprints** — `index.html`, the **first-load JS chunk** (often called `index-*.js`, `app-*.js`, or `entry-*.js`), the **CSS file** the user actually loads, the **main font** if self-hosted. For each: raw size **and gzipped size**.
- **Code-splitting per route** — for SPAs with multiple routes, one row per top-level route: `name`, `total JS KB`, `gzipped KB`. (Most projects can't sustain this — only capture if the budget is real.)
- `BuildTime` — elapsed `time` of the build command
- **Lint warnings count** — grouped by rule family (e.g. `react-hooks: 0`, `a11y: 2`, `import: 0`); the XML template ships with placeholders to expand

**Capture rule:** every `eval` run measures these, even on runs that don't change frontend code. It costs ~50ms on top of `vite build`/`next build`/`ng build`, and it surfaces regressions like a font-weight shift that doubled your CSS overnight. Use the threshold `Artifact size > 10% change` as the seed; refine once you know your normal variance.

## Framework-specific gotchas

- **React 19 + Server Components:** the `<BuildArtifacts>` block needs to record both the RSC payload size **and** the hydrated bundle size; the `<E2E>` tier needs browser pass + node pass.
- **Vue 3 `<script setup>`:** compile-time macros (`defineProps`, `defineModel`) add build steps; if the build size jumps, check the macro compilation count first.
- **Svelte 5 runes ($state, $derived):** compiler-version-locked; capture compiler version in `<Dependencies>`.
- **Aurelia 2 + standardjs/custom-elements:** template compilation is in the bundle; record `@aurelia/runtime` version and `aurelia-cli` version.
- **Angular Ivy / Signals:** if Ivy partial-compilation is on, `TotalSizeMB` can shift between branches for no functional reason — pin Ivy in `<Dependencies>` and warn the user during `init`.
- **Storybook 8 + Vite-builder:** outputs two artefacts (the `storybook-static/` export + the app build). Capture the relevant one for the tier under test.

## Anti-patterns the agent should call out during init

- **DOM in unit tests** — e.g. a Vitest spec that imports `react-dom/server` to render in node; flag and ask whether it should move to the Component tier.
- **E2E tests with hard-coded waits** — replace with `waitFor`-style locators.
- **Coverage measured over `.vue` files but skipping the script block** — Vite plugin misconfigured; visible in `<Dependencies>` drift.
- **CSS file masquerading as a route bundle** — the `<BuildArtifacts>` block records both separately; mixing them is a tell.
- **Snapshot tests of the full DOM** — replace with role-based assertions; point at Testing Library's recommended pattern.

---

> **Reminder:** after init, this file is dormant. The protocol owns the policy. If the user later changes the framework, they edit the protocol directly — not this file.
