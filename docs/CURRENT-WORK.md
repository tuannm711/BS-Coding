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

**V2 plan 15 — renderer UI and Figma binding.**

- **Branch:** `v2/p15-renderer-ui-figma`
- **Gate:** `npm run typecheck`, P15 renderer unit tests, production build and
  `v2-core-flow.spec.ts` + `v2-runtime-switch.spec.ts` are green
- **Status:** P14 merged into `master` at `a561a95`; typecheck, 17 targeted
  tests, production build, the full suite at 1374 passing and 15 Playwright
  e2e tests are green after merge. P15 preflight is blocked before Task 1.
- **Scope:** locked Figma navigation/shell, project/work-session screens,
  agents/settings and functional bottom-panel flows backed by V2 DTOs.
- **Plan:** [`v2/implementation-plans/plans/15-renderer-ui-figma-binding.md`](v2/implementation-plans/plans/15-renderer-ui-figma-binding.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | Resolve P15 Figma context and backend projection prerequisites | Required before Task 1 implementation |

## Blocked

- **Figma context unavailable:** the approved Figma Make URL has no `node-id`;
  this session exposes no `get_design_context` tool or Figma MCP resource. The
  mandatory design-to-code workflow forbids implementing from screenshots or
  assumptions.
- **Backend projection/API gap:** P14 exposes only five preload methods and
  registers no concrete V2 application routes; P15 Tasks 2-5 require project,
  lifecycle, agent/settings and bottom-panel projections/commands that no
  later plan is scheduled to provide.

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
