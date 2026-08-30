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

**V2 plan 16 — security, permissions and secrets.**

- **Branch:** `v2/p16-security-secrets`
- **Gate:** Task 2 layered permission profile tests and `npm run typecheck` pass
- **Status:** P14 merged into `master` at `a561a95`. P15 backend Tasks 1-5 and
  Task 6A are committed on paused branch `v2/p15-backend-projections`; owner
  approved P16-first reorder because Task 6B provider/settings composition
  requires V2 vault/security ports. P16 Task 1 vault adapter is committed at
  `d325f92`; Task 2 layered permissions is in progress.
- **Scope:** encrypted vault edge, layered permission profiles, recursive
  event/log redaction and renderer security regression.
- **Plan:** [`v2/implementation-plans/plans/16-security-permissions-secrets.md`](v2/implementation-plans/plans/16-security-permissions-secrets.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | Resume P15 backend Task 6B + Task 7 | Requires P16 merge |
| 2 | Resume locked P15 renderer plan | Requires backend prerequisite |

## Blocked

- **P15 backend composition:** paused on `v2/p15-backend-projections` until
  P16 provides vault/security ports; no placeholder or direct legacy handler is allowed.

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
