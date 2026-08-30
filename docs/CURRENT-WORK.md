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

**V2 P15 renderer UI — Task 1 implementation.**

- **Branch:** `v2/p15-renderer-ui-figma`
- **Gate:** Task 1 TDD — bootstrap flag, shell, navigation and design tokens
- **Status:** P15 backend prerequisite merged locally into `master` at `c44cddc`
  and post-merge verified: typecheck pass, full Vitest 233 files / 1423 tests,
  production build pass and Playwright 16/16 pass. Continuous V2 execution rules
  merged into `master` at `98f8a31` and this renderer branch is being synchronized
  with both merges. The approved UX source is the local vendored
  Figma Make export under `docs/v2/prototype/figma-make/`; no live URL or
  connector is required. The owner approved a safe immutable
  `window.bs.v2.enabled` flag sourced from main/BrowserWindow arguments so the
  renderer selects V1/V2 synchronously without exposing process or environment.
- **Scope:** Task 1 creates the V2 application shell, exactly five production
  navigation items and design tokens under `src/renderer/src/v2`, preserving
  the V1 renderer until cutover.
- **Plan:** [`v2/implementation-plans/plans/15-renderer-ui-figma-binding.md`](v2/implementation-plans/plans/15-renderer-ui-figma-binding.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | P15 renderer Task 1 — shell/navigation/design tokens | Bootstrap flag decision approved |
| 2 | P15 renderer Task 2 — Home and Project screens | Requires Task 1 commit |

## Blocked

- No technical blocker.

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
