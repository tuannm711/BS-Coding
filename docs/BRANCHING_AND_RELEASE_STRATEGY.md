# BS Coding — Branching and Release Strategy

BS Coding is a single-track repository.

## 1. Topology

    main ── repository governance / default branch
    develop/v1 ── development
    release/v1 ── releases, published from v1.* tags

## 2. Branch Roles

| Branch | Role | Release Publishing | Tag Pattern |
|--------|------|--------------------|-------------|
| **`main`** | Repository governance & default branch | **NO** | **NO** |
| **`develop/v1`** | Active development | **NO** | **NO** |
| **`release/v1`** | Stable & maintenance releases | **YES** | `v1.*` (from `release/v1` only) |

## 3. Hard Rules

1. **Maximum remote branches = 3**: `main`, `develop/v1`, `release/v1`.
2. **Temporary branches are local-only** (`feature/*`, `bugfix/*`, `hotfix/*`, `codex/*`, `task/*`, `v1/p*`).
3. **`main` is governance-only**: no product code, no releases.
4. **Release source**: releases are published only from `release/v1` via `v1.*` tags. Merging
   `develop/v1` into `release/v1` can overwrite `release/v1`'s tag-publish `build.yml` — verify
   `on: push: tags: ['v1.*']` survives before tagging.

## 4. Auto-Update

- Discovery reads `https://github.com/tuannm711/BS-Coding/releases.atom`, keeps tags with the running
  app's major version and points electron-updater at the highest one.
- A guard rejects any update whose major version differs from the running app.
