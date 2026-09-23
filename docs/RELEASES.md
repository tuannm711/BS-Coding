# Releases

`main` is the governance/default branch and does not itself publish. It governs
two independent product tracks. Because a single `package.json` version cannot
represent both, this table is the source of truth for the latest **released**
version of each track, alongside the git tags (`v1.*`, `v2.*`) and the
[GitHub Releases](https://github.com/tuannm711/BS-Coding/releases) page.

| Track | Latest released version | Date | Status |
|-------|-------------------------|------|--------|
| **V1** (`release/v1`) | `1.3.4` | 2026-09-22 | Stable / maintenance |
| **V2** (`release/v2`) | — | — | In development (`2.0.0`, not yet released) |

## Conventions

- `main`'s `package.json` version is a governance value set to the **highest
  released version across tracks** (currently `1.3.4`; it becomes `2.0.0` when V2
  ships). It is not "the V1 latest" — read this table or the tags for per-track
  latest.
- On every release, update the matching row here, bump `main`'s `package.json` to
  the highest released version, and carry the `docs/release-notes/v<version>.md`
  file onto `main` (its version guard requires notes for the current version).
