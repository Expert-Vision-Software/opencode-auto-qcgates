# Backends — Init-Time Reference

> **Scope:** init-time only. Once the consumer's `testing-protocol.md` is written and configured, **this file has no further bearing**. The protocol is the single source of truth for that project's tiers, toolchain, thresholds, and pass/fail criteria.
> **When to consult:** Step 2 of `/test-baseline init` (tier discovery). Use it to ask better questions and seed better defaults — not to override what the user tells you.
> **Authority rule:** never copy a backend's toolchain into the protocol without confirming with the user. Each project picks its own tier set.

The skills are backend-language agnostic at the body level. This reference exists so the agent has a quick checklist of likely tier dimensions and toolchain patterns to grill the user about — so `/test-baseline init` produces a richer protocol in fewer turns.

## Backend tiers to ask about

Grill in this order until the user names each one. Each named tier becomes a `<stage>` and an XML block.

| Tier | What it is | Likely toolchain |
|------|-----------|------------------|
| **Domain** (or "core") | Pure business logic, entities, value objects | .NET \| JVM \| Go \| Rust \| Python \| TypeScript \| Erlang/Elixir |
| **Application** | Use cases, command/query handlers, services | Same as Domain (often same language) |
| **Infrastructure / Adapter** | Persistence, external clients, I/O | Language-specific (ORM/SDK choice) |
| **API surface** | HTTP, gRPC, GraphQL, message handlers | Web framework of choice |
| **Worker / Background** | Queues, scheduled jobs, async handlers | Same as API surface, usually |
| **Library / SDK** | Reusable package output, dual ESM/CJS, typed exports | Build artifact format + test harness |
| **CLI** | Standalone command-line binary | `cmd/` entry, exit code contracts |
| **Schemas** | OpenAPI, Protobuf, Avro, JSON Schema | Validator of choice |
| **Documents / Policies** | Markdown, contracts, ADRs | Linters + custom rules |

If the project is a non-code repo (documents, configs, data), skip the language tiers and grill for **document classes** instead: handbook sections, manifest kinds, datasets, model cards, etc. — same idea, no compiler in the loop.

## Backend toolchain map (popular stacks)

Each row maps a language to the build/test/coverage trio the agent should suggest. Confirm with the user before pinning.

| Language | Build | Test | Coverage |
|----------|-------|------|----------|
| C# / .NET | `dotnet build` | `dotnet test --collect:"Code Coverage;Format=Cobertura"` | coverlet / coverlet.collector |
| TypeScript / Node (server) | `npm run build` / `tsc -b` | `npm test` / `npm run test:coverage` | `c8` / `nyc` / `@vitest/coverage-v8` |
| Java / Kotlin (JVM) | `mvn -B verify` / `gradle build` | `mvn test` / `gradle test` | JaCoCo |
| Python | `python -m build` / `pip wheel` | `pytest` | `pytest --cov` + `coverage.py` |
| Go | `go build ./...` | `go test ./...` | built-in `go test -cover` + `go-cover` |
| Rust | `cargo build` | `cargo test` | `cargo tarpaulin` / `cargo-llvm-cov` |
| Elixir | `mix compile` | `mix test` | built-in `:cover` + `mix test --cover` |
| Haskell | `cabal build` / `stack build` | `cabal test` / `stack test` | HPC / `cabal-helper` |
| Scala | `sbt compile` / `mill` | `sbt test` | `scoverage` |
| C++ | `cmake --build` / `ninja` | `ctest` / `catch2` / `gtest` | `gcov` / `llvm-cov` |
| Erlang OTP | `rebar3 compile` | `rebar3 ct` / `eunit` | built-in `cover` |

These rows are *grill scaffolding* — the user might pick a custom build script, Bazel, Buck, Nx, Pants, please, or Bazel rules. Confirm rather than assume.

## Questions to grill the user (suggested order)

1. **Single-language or multi-language?** If multi, is each language a *tier* or a *subproject inside one tier*?
2. **For each language tier — exact build, test, coverage commands?** (Confirm the editor's defaults; suggest the row above as a starting point.)
3. **Are tests split into Unit / Integration / E2E?** If yes, are there separate commands per split? (Common: yes for xUnit + WAF, pytest + separate e2e runner.)
4. **Domain tier:** does it touch the filesystem, network, clock, or randomness? (Answers "Domain Isolation" — should be zero external dependencies; pure.)
5. **Integration tests:** do they spin up a container (Testcontainers) or hit a mock server (WireMock, Mountebank, in-memory)?
6. **E2E tests:** are they wired to staging infra, or do they start the app in-process (e.g. `WebApplicationFactory`, supertest, Ktor `testApplication`)?
7. **Build artifacts:** what's the output directory and its **canonical name** (`bin/`, `dist/`, `target/`, `build/`, `_build/`, `pkg/`, `out/`, `target/release/`)? The protocol's `<Build>` block needs the path and a metric for *file count* + *total size MB*.
8. **Coverage threshold per tier?** (Convention: domain ≥ 95%, application ≥ 80%, infra ≥ 60%, E2E excluded.)
9. **Lint / static analysis** — count of warnings, categories tracked? (eslint, Clippy, shellcheck, etc.)
10. **External services under test?** If yes, the protocol needs a `<DomainIsolation>no-mocks</DomainIsolation>` rule and a mock catalogue.

## Build artifact capture (always part of baseline)

**This is mandatory for every backend tier.** The protocol's `<Build>` block (or per-tier `<BuildArtifacts>` block, if you split it) records:

- `OutputDirectory` — canonical name + path
- `FileCount` — number of files produced (excludes `.pdb`, `.dSYM`, `*.map`)
- `TotalSizeMB` — sum of file sizes (uncompressed)
- `BuildTime` — elapsed `time` of the build command
- **Per-file fingerprint for critical outputs** — primary binary, primary shared library, schema file, container image digest — whichever the tier considers load-bearing
- **Gzipped size for served artefacts** — APIs that gzip-on-the-fly should also record the gzipped byte count of the primary response

**Capture rule:** every `eval` run measures these, even if the consumer thinks they don't care. The first time a metric surprises a project ("why is our image 1.2 GB?"), threshold rules catch the drift early. Set `Artifact size > 10% change` (Any direction) as the seed; refine per tier once you know your normal variance.

## Anti-patterns the agent should call out during init

- **Domain tests that import infrastructure** (e.g. a JUnit test in `src/domain/` that pulls in a Spring `@Repository`) — Domain Isolation violation; surface and offer to relayer.
- **Tests gated on network reachability** (no offline mode) — flag for a mock rewrite.
- **Single test monolith** (one project file with 5,000 tests) — slow compile feedback; offer to split.
- **Coverage inflated by generated code** — point at `*.designer.cs`, `*.pb.go`, `_generated/**` for an exclusion list.
- **Coverage measured only over tests** (i.e. the metric is true but useless) — prompt for a coverage-on-real-source run.

## Common backend coverage gotchas

- **JaCoCo excludes Spring's generated proxies by default** — check `<excludes>`.
- **pytest + coverage.py** needs `source = ["src"]` in `.coveragerc`; otherwise it counts tests.
- **`go test -cover`** only counts the package under test unless you wrap with `go test -coverprofile=cover.out ./...`.
- **cargo tarpaulin** ignores `unsafe` blocks and async tests it can't trace — caveat in the protocol.

---

> **Reminder:** after init, this file is dormant. The protocol owns the policy. If the user later changes the toolchain, they edit the protocol directly — not this file.
