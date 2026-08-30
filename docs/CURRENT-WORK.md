# Current work

The highest-level statement of what this project is doing. Read it before
starting anything. If you are asked to do something this file does not describe,
update it before you start.

It belongs to no version. `docs/v1/` is the past and `docs/v2/` is the target;
this is the present. V1.3.2 is the shipped product and V2.0.0 is being built
beside it, so both appear here.

Last updated: 2026-08-30

## Now

Exactly one entry. If two things are genuinely running, that is what this file
exists to say out loud.

**V2 P15 prerequisite — awaiting merge approval.**

- **Branch:** `v2/p15-backend-projections`
- **Gate:** Owner merge approval
- **Status:** P16 merged into `master` at `806c792` and merged back into this
  branch. P15 backend Tasks 1-5 are committed at `855a692`, `fecc97b`,
  `5b7c384`, `22d8352` and `d17d760`; Task 6A typed IPC/preload contracts and
  route parity are committed at `3864cc2`; Task 6B concrete composition, build
  and focused Electron smoke are committed at `99b2c34`. Task 7 durable
  project/lifecycle/runtime/rework persistence, projection publication and review remediation
  are committed at `6b95ff4`. Inline review has no remaining P0-P2 findings.
  Completion evidence: typecheck pass; focused 16 files / 50 tests; full Vitest
  233 files / 1423 tests; production build pass; full Playwright 16/16 pass.
  `docs/v2` remains unchanged under the documentation-pack lock. The approved UX source is
  the local vendored Figma Make export, so no live Figma connector is required.
- **Scope:** owner-scoped projection DTOs/services, real IPC/preload routes,
  idempotent lifecycle commands and bottom-panel backend projections required
  by P15 Tasks 2-5.
- **Spec:** [`superpowers/specs/2026-08-30-p15-backend-projection-prerequisite-design.md`](superpowers/specs/2026-08-30-p15-backend-projection-prerequisite-design.md)
- **Plan:** [`superpowers/plans/2026-08-30-p15-backend-projection-prerequisite.md`](superpowers/plans/2026-08-30-p15-backend-projection-prerequisite.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | Merge `v2/p15-backend-projections` into `master` | Requires owner approval |
| 2 | Resume locked P15 renderer plan | Requires merged backend prerequisite; uses vendored prototype |

## Blocked

- **Renderer implementation remains blocked:** backend projection/API branch must
  pass the owner merge gate before locked P15 UI Task 1 begins. The
  approved UX source is already vendored under `docs/v2/prototype/figma-make/`.

## Standing rules

Constraints that will expire, so they are not in `AGENTS.md`.

- V2 is built beside V1 under `src/main/v2`, `src/shared/v2` and
  `src/renderer/src/v2` until the plan 20 cutover. `BsAgentManager` never
  becomes a V2 dependency.
- The V2 documentation pack is placed whole. Nothing under `docs/v2/` is edited,
  moved or renamed.

## Where the detail lives

This file does not repeat any of it. In particular it does not summarise the
debt ledger: two copies of a list diverge, which this codebase has already paid
for once with duplicated quota state.

| Question | Where |
|---|---|
| What are the project's rules | [`/AGENTS.md`](../AGENTS.md) |
| What was deliberately not done | [`DEBT.md`](DEBT.md) |
| What is the V2 target | [`v2/START_HERE.md`](v2/START_HERE.md) |
| Which V2 plan landed, at which commit | `docs/v2/implementation-progress.md`, created by P01 |
| Which acceptance criteria are met | `docs/v2/acceptance-matrix.md`, required before release by the master plan |
| How the project reached a decision | [`superpowers/specs/`](superpowers/specs/) and [`superpowers/plans/`](superpowers/plans/) |
| What shipped in each release | [`release-notes/`](release-notes/) and `docs/v1/changelog-*.md` |
