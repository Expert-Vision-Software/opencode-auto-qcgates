# Source Controls — Discovery Reference

> **Scope:** always-relevant reference (consult during `init`, `eval`, and `update`).
> **Authority rule:** this file is a discovery aid, not policy. The consumer's `testing-protocol.md` is the single source of truth for thresholds and pass/fail; this file only helps the agent locate the project root and detect change in any VCS.

The skills are VCS-agnostic at the body level, but several workflows need VCS awareness to run correctly: locating the consumer files, detecting "no changes since last eval" (regression-checking caching), and deciding whether source-of-truth diffs should drive a fresh run. Use this reference to map the four questions to the right concrete command for each supported source control.

## Locate the project root

Try, in order. The first match is the project root.

| Source control | Local root marker(s) | Detection command (preferred) |
|----------------|----------------------|-------------------------------|
| Git | `.git/` (file or directory) | `git rev-parse --show-toplevel` |
| Mercurial | `.hg/` directory | `hg root` |
| Subversion | `.svn/` directory | `svn info --show-item wc-root` |
| Pijul | `.pijul/` directory | `pijul record ls` (workspace root) |
| Fossil | `.fossil` file or `_FOSSIL_` directory | `fossil info` |
| **Unity VCS** (Unity Version Control / Plastic SCM) | `.plastic/` directory with `workspace.lock` or `viewconfig.dat`; otherwise rely on the **VCS client** | `cm lsworkspace --format {path}` or `cm status --no-color` from the workspace root |
| Perforce Helix Core | none locally by default; look for `.p4config.txt` (P4CONFIG) or rely on the **VCS client** | `p4 info` (depot + client paths) |
| Bazaar | `.bzr/` directory | `bzr root` |
| Darcs | `_darcs/` directory | `darcs query repo` |

**Fallback rule:** if no marker is found **and** no client command succeeds, treat `cwd` as the project root and warn the user. Never invent a path.

### Unity VCS specifics

Unity VCS (formerly Plastic SCM) is the most common source control in Unity-based game projects alongside Perforce. It has subtle behaviours the agent must respect:

- **No `.git/` equivalent for subprojects**: Unity VCS workspaces can mount multiple branches under one root. A "subpackage root" usually has its own `.plastic/`, **but** Unity UPM packages often don't — they live as read-only paths under `Packages/com.<vendor>.<name>/`.
- **Workspace marker vs. set root**: `.plastic/` containing `viewconfig.dat` marks an actual local workspace. A `.plastic/` containing only `serverconfig.dat` is a shared-config stub, not a workspace — keep climbing.
- **Files in Unity's `Assets/`, `Packages/`, `ProjectSettings/`** are first-class VCS-tracked trees. The `Library/` and `Temp/` directories are VCS-ignored by convention.
- **Detect changes:** `cm status --short --no-color` or `cm find revisions where type=changed`. Treat the workspace root as the "project root" — the plugin protocol applies per workspace, not per Unity package.
- **The user's `Assets/` folder is usually the unit of testing** (PlayMode + EditMode tests, NUnit). When picking tiers in `init`, ask whether tiers map to `Assets/Scripts/`, `Assets/Tests/`, or `Packages/com.<vendor>.<name>/Tests/`.

## Detect "no changes since last eval"

`regression-checking` reuses cached results when source-of-truth hasn't moved. Map the cache flag to the right VCS command:

| Source control | "Has changes?" command | Stable hash to record in cache key |
|----------------|------------------------|------------------------------------|
| Git | `git status --porcelain` is empty **AND** `git rev-parse HEAD` unchanged | HEAD SHA |
| Mercurial | `hg status` is empty **AND** `hg id -i` unchanged | `hg id` tuple (rev + global id) |
| Subversion | `svn status -q` is empty **AND** `svn info -r BASE` revision unchanged | working revision |
| Pijul | `pijul diff` is empty | channel hash |
| Fossil | `fossil changes --differ` is empty **AND** `fossil info \| grep check-in` unchanged | check-in hash |
| **Unity VCS** | `cm status --short --no-color` empty **AND** `cm gethead --working --format changeset` unchanged | changeset spec |
| Perforce Helix Core | `p4 status -A` is empty **AND** `p4 have \| head -1` revision unchanged | changelist number |

When the VCS tool isn't installed in the agent's PATH, fall back to a **mtime scan** of source-tree files (`find . -newer <cache_anchor> -not -path '*/node_modules/*' -not -path '*/.git/*'`) — but flag the fallback in the eval output so the user knows the cache isn't trustworthy.

## Detecting which VCS a project uses

Run these in order; first hit wins:

```bash
test -d .git      && echo git
test -d .hg       && echo mercurial
test -d .svn      && echo subversion
test -d .pijul    && echo pijul
test -e .fossil   && echo fossil
test -d _FOSSIL_  && echo fossil
test -d .plastic  && echo unity-vcs
test -f .p4config.txt && echo perforce
command -v cm >/dev/null && cm lsworkspace --format '{path}' >/dev/null 2>&1 && echo unity-vcs
command -v p4 >/dev/null && p4 info >/dev/null 2>&1 && echo perforce
```

If none match, the project is either VCS-less or VCS-unreachable from this session — log the gap and continue with `cwd` as the project root.

## What this file does NOT do

- It does **not** define threshold policy. The protocol's `baseline_thresholds` owns that.
- It does **not** decide which files are tracked. `.gitignore`/Plastic's `.plasticignore`/P4's `p4ignore` rule the per-VCS file set.
- It does **not** assume any single VCS wins. The agent runs the detector chain above every session, and picks whichever answer matches.

If the user's project uses a VCS not listed here, the agent should add it to this table (community contribution back to the plugin).
