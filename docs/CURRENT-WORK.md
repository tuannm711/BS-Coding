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

**V2 P17 observability, usage and budget — integration amendment decision.**

- **Branch:** `v2/p17-observability-usage-budget`
- **Gate:** Owner decision on composing ledger/budget/diagnostics into runtime, admission and UI
- **Status:** P15 backend prerequisite merged locally into `master` at `c44cddc`
  and post-merge verified: typecheck pass, full Vitest 233 files / 1423 tests,
  production build pass and Playwright 16/16 pass. Continuous V2 execution rules
  merged into `master` at `98f8a31` and this renderer branch is being synchronized
  with both merges. The approved UX source is the local vendored
  Figma Make export under `docs/v2/prototype/figma-make/`; no live URL or
  connector is required. The owner approved a safe immutable
  `window.bs.v2.enabled` flag sourced from main/BrowserWindow arguments so the
  renderer selects V1/V2 synchronously without exposing process or environment.
  Task 1 shell/navigation/tokens is committed at `c15d574`. Task 2 Home/Project
  projection screens is committed at `5d68125` with typecheck, 235 files / 1427
  Vitest, build and 16/16 E2E green. The owner approved a main-resolved
  `workSession.runtimeTargets` query; its contract/adapter/route amendment passed
  typecheck, 235 files / 1428 Vitest, build and 16/16 E2E. Task 3 Work Session
  UI passed typecheck, 236 files / 1429 Vitest, build and Playwright 16/16.
  P15 renderer merged locally into `master` at `c4adc62` and post-merge passed
  typecheck, 237 files / 1430 Vitest, production build and Playwright 18/18.
  P17 Task 1 is committed at `46e1378`, Task 2 at `b9e71d7`, and Task 3 at
  `6d757bc`. Task 4 diagnostics/redaction/bottom-log integration is green.
  Completion review found the plan's minimal tasks do not wire canonical USAGE
  events into the ledger, do not call budget admission from real dispatch, and
  do not expose usage/budget projections to Work/Providers UI.
- **Scope:** Decide whether to add a P17 composition amendment, accept a partial
  projector-only integration, or defer the missing acceptance with explicit debt.
- **Plan:** [`v2/implementation-plans/plans/17-observability-usage-budget.md`](v2/implementation-plans/plans/17-observability-usage-budget.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | Resolve P17 integration amendment | Required for stated P17 acceptance |
| 2 | Complete P17 review and local merge | Requires chosen integration path |

## Blocked

- **Decision required:** P17's unit-level services are not connected to all
  acceptance consumers (runtime usage, real admission and UI projections).

## Standing rules

Constraints that will expire, so they are not in `AGENTS.md`.

- V2 is built under `src/main/v2`, `src/shared/v2` and `src/renderer/src/v2`.
  V1 remains beside it only for consumers not yet migrated; safely replaced V1
  is removed incrementally. `BsAgentManager` never becomes a V2 dependency.
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
