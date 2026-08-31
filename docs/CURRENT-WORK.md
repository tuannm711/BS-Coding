# Current work

The highest-level statement of what this project is doing. Read it before
starting anything. If you are asked to do something this file does not describe,
update it before you start.

It belongs to no version. `docs/v1/` is the past and `docs/v2/` is the target;
this is the present. V1.3.2 is the shipped product and V2.0.0 is being built
beside it, so both appear here.

Last updated: 2026-08-31

## Now

Exactly one entry. If two things are genuinely running, that is what this file
exists to say out loud.

**V2 P19 updates and remote control integration — Task 2 implementation.**

- **Branch:** `v2/p19-updates-remote-control`
- **Gate:** Task 2 TDD — remote control and pairing contracts
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
  do not expose usage/budget projections to Work/Providers UI. The approved
  amendment now connects runtime finish usage → canonical USAGE → atomic ledger
  → budget admission → scoped IPC → Work/Providers UI. P17 merged at `3cbb772`
  and post-merge passed typecheck, 243 files / 1441 Vitest, build and 18/18 E2E.
  P18 Task 1 backup manifest is committed at `6b4afbe`. Task 2 preflight found
  that P05 intentionally exposes provider accounts through a V1 compatibility
  port, while the V2 schema/repositories contain no durable provider-account
  metadata store or vault-reference contract. P18 cannot import provider
  metadata durably or complete provider cutover without an approved schema and
  repository amendment. The owner approved the recommended amendment: add an
  immutable migration 006, a main-only provider-account metadata entity and a
  repository that preserves opaque vault references without exposing secret
  bytes through shared/renderer DTOs. Task 2 core imports are committed at
  `d6fa88b`; typecheck and 3 focused files / 10 tests passed before commit.
  Task 3 canonical session conversion is committed at `0c26c3d`; typecheck and
  4 focused files / 17 tests passed before commit.
  Task 4 implements checkpointed/resumable migration orchestration, backup
  enforcement and count/hash/sample validation. Preflight confirmed the planned usage stage
  initially had no concrete V1-to-V2 import boundary: V2 UsageRecord requires provider/account,
  V1 session aggregates do not carry that attribution, and quota snapshots have
  neither persistence nor the architecture-required source/confidence fields.
  The owner approved the recommended amendment: import only attributable usage,
  persist compatible historical quota snapshots with source/confidence, and
  report unattributable aggregates instead of inventing provider metadata.
  Task 4 is committed at `ee35c22`; typecheck and 7 focused files / 18 tests
  passed before commit. Completion review found no P0-P2; pre-merge verification
  passed typecheck, full Vitest 248 files / 1456 tests, production build and
  Playwright 18/18. P20 Task 3 owns production writer composition/cutover and
  explicitly consumes the successful P18 migration report. P18 merged locally
  into `master` at `eff2e91`; post-merge verification passed typecheck, full
  Vitest 248 files / 1456 tests, production build and Playwright 18/18, then the
  merged branch was deleted.
  Task 1 wraps the existing updater behind a V2 application port with typed,
  serializable status and no coupling to workflow state. Preflight implementation
  maps check/download/apply/status and is focused-green, but completion review
  found the locked architecture also requires stable/beta channel selection;
  neither the detailed plan nor current V1 Updater exposes that capability. The
  owner approved extending the V2 port and V1 updater edge with explicit
  STABLE/BETA selection backed by electron-updater channel/prerelease settings.
  Task 1 is committed at `28ca802`; 19 focused tests and typecheck passed.
- **Scope:** Define serializable V2 enable/disable, short-lived pairing and
  connected-device DTOs with no project content, credential or raw transport
  handle exposure.
- **Plan:** [`v2/implementation-plans/plans/19-updates-remote-control.md`](v2/implementation-plans/plans/19-updates-remote-control.md)

## Next

Decided work, in order. Not an idea backlog — something reaches this list only
after it has been decided.

| # | Work | Prerequisite |
|---|---|---|
| 1 | P19 Task 2 — remote control contracts | Task 1 committed at `28ca802` |
| 2 | P19 Task 3 — secure BrowserBridge adapter | Requires Task 2 commit |

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
