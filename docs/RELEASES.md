# Releases

`main` is the governance/default branch and does not itself publish. BS Coding has
one product track, published from `release/v1` via `v1.*` tags; see the
[GitHub Releases](https://github.com/tuannm711/BS-Coding/releases) page.

| Track | Latest released version | Date | Status |
|-------|-------------------------|------|--------|
| **BS Coding** (`release/v1`) | `1.3.4` | 2026-09-22 | Stable / maintenance |
| ~~V2~~ | — | — | Moved on 2026-09-25 to the separate product **BS Workflow** — [tuannm711/BS-Workflow](https://github.com/tuannm711/BS-Workflow) |

## Conventions

- `main`'s `package.json` version equals the latest released BS Coding version
  (currently `1.3.4`).
- On every release, update the row above, bump `main`'s `package.json` to the
  released version, and carry the `docs/release-notes/v<version>.md` file onto
  `main` (its version guard requires notes for the current version).
- BS Workflow versions and releases are tracked only in its own repository.
