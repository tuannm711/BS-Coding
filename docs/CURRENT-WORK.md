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

**V2 plan 07 — tool execution and protocol guard.**

- **Branch:** `v2/p07-tool-guard`
- **Gate:** `npm run typecheck` plus `tool-call-schema.test.ts`,
  `protocol-guard.test.ts`, `permission-engine.test.ts`, and
  `tool-executor.test.ts` are green
- **Status:** P05 merged into `master` at `7c1066b`; typecheck, 15 targeted
  tests, production build and the full suite at 1267 passing are green after
  merge. P07 prerequisites P02/P04 are green and merged. Task 1 (structured
  tool contracts/schemas) is in progress.
- **Scope:** tool definitions/executor, permission policy and protocol guard;
  narrated prose must never become an executable tool call.
- **Plan:** [`v2/implementation-plans/plans/07-tool-execution-protocol-guard.md`](v2/implementation-plans/plans/07-tool-execution-protocol-guard.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | V2 plan 06 — context compiler and RuntimeEpoch switching | P05 merged; scheduled after P07 because work is inline |
| 2 | V2 plan 08 — agent runtime | P06 and P07 merged |

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
