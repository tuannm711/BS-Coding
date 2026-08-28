# Current work

The highest-level statement of what this project is doing. Read it before
starting anything. If you are asked to do something this file does not describe,
update it before you start.

It belongs to no version. `docs/v1/` is the past and `docs/v2/` is the target;
this is the present. V1.3.2 is the shipped product and V2.0.0 is being built
beside it, so both appear here.

Last updated: 2026-08-29

## Now

Exactly one entry. If two things are genuinely running, that is what this file
exists to say out loud.

**V2 plan 01 — foundation and module boundaries.**

- **Branch:** `v2/p01-foundation`
- **Gate:** `npm run typecheck` passes and the three P01 unit test files are green
- **Status:** all three tasks landed, review findings resolved, and the completion
  gate rerun green — `npm run typecheck`, 9/9 tests across the three P01 test
  files, and the full suite at 1186 passing. **Reviewed; awaiting merge** before
  P02.
- **Landed:** the approved Figma Make prototype vendored under `docs/v2/prototype/`;
  the V2 skeleton and barrels; the common primitives `EntityId`, `IsoDateTime`,
  `CommandResult<T>`, `Clock`, `IdGenerator`; the `createV2Runtime` bootstrap gate
  and its `BS_V2`-gated seam in `src/main/index.ts`. Commits recorded in
  [`v2/implementation-progress.md`](v2/implementation-progress.md).
- **Plan:** [`v2/implementation-plans/plans/01-foundation-module-boundaries.md`](v2/implementation-plans/plans/01-foundation-module-boundaries.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | Merge V2 plan 01 into `master` | P01 gate green and reviewed |
| 2 | V2 plan 02 — domain model and state machines | P01 merged |
| 3 | V2 plan 03 — SQLite persistence and event store | P02. Needs a SQLite dependency chosen; the repo has none today |
| 4 | V2 plan 04 — canonical event protocol | P03 |

## Blocked

Nothing.

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
