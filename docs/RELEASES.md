# Releases

`main` is the governance/default branch and does not itself publish. Releases are published from
`release/v1` via `v1.*` tags; see the [GitHub Releases](https://github.com/tuannm711/BS-Coding/releases) page.

| Latest released version | Date | Status |
|-------------------------|------|--------|
| `1.3.4` | 2026-09-22 | Stable / maintenance |

## Conventions

- `main`'s `package.json` version equals the latest released version (currently `1.3.4`).
- On every release, update the row above, bump `main`'s `package.json` to the released version, and
  carry the `docs/release-notes/v<version>.md` file onto `main` (its version guard requires notes for
  the current version).
