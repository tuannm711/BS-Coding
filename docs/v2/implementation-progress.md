# V2 Implementation Progress

The mechanical ledger the master plan requires: one row per detailed plan, with
the commit that carried its completion gate. This records *that* a plan's gate
passed, not what it built — the narrative of what is being worked on lives in
`../CURRENT-WORK.md`, and why anything was deferred lives in `../DEBT.md`.

A row is written when a plan's completion gate is green, per master-plan
execution rule 7. Proceeding to the next plan additionally requires that this
plan be reviewed — that gate is tracked in `../CURRENT-WORK.md`, not here.

| Plan | Title | Completion commit | Gate |
|---|---|---|---|
| P01 | Foundation and module boundaries | `a3d8ab1` | `npm run typecheck` + `tests/unit/v2/{module-boundaries,common-primitives,v2-bootstrap}.test.ts` green; full suite 1185 passing |
| P02 | Domain model and state machines | `d0a6dff` | `npm run typecheck` + 7 P02 unit test files green; full suite 1229 passing |
| P03 | SQLite persistence and event store | `fa246e7` | `npm run typecheck` + 4 P03 unit test files + production build green; full suite 1241 passing |
| P04 | Canonical event protocol | `a818fe3` | `npm run typecheck` + 3 P04 unit test files + EventStore/boundary regressions + production build green; full suite 1254 passing |
| P05 | Provider, account, model and routing | `289b8d4` | `npm run typecheck` + 4 P05 unit test files + boundary guard + production build green; full suite 1267 passing |

## P01 notes

- V2 roots created beside V1: `src/main/v2/{domain,application,runtime,infrastructure,ipc}`, `src/shared/v2`, `src/renderer/src/v2`. The legacy main entry point imports only the explicit V2 bootstrap seam; V2 does not import legacy orchestration.
- Common primitives: `EntityId`, `IsoDateTime`, `CommandResult<T>` with `success`/`failure` in `src/shared/v2/contracts/common.ts` (serializable, no Node import); `Clock` and `IdGenerator` ports in the application layer; `SystemClock` and `UuidGenerator` in infrastructure.
- Bootstrap gate `createV2Runtime({ enabled, userDataPath })` wired into `src/main/index.ts`, gated on `BS_V2=1` and off by default, disposed in the before-quit chain. V1 behavior unchanged.
- Task commits: `0bbe7b2` (boundaries), `6d1fff5` (primitives), `a3d8ab1` (bootstrap gate).

## P02 notes

- Core entity contracts cover Project → WorkSession → WorkflowRun → Task/TaskRun → AgentDefinition/AgentVersion → AgentRun → RuntimeEpoch, with minimal Review/Finding/Artifact references and a full execution correlation snapshot.
- WorkflowRun, TaskRun, AgentRun and RuntimeEpoch transitions are named, centrally validated and reject illegal/terminal transitions. WorkSession status is an exhaustive projection of WorkflowRun state.
- AgentVersion snapshots are cloned and deeply frozen; the shared AgentVersion contract exposes readonly configuration.
- Task commits: `0d702ae` (entities/correlation), `d2c6aac` (workflow/task states), `4409777` (WorkSession projection), `a1052f3` (AgentVersion/RuntimeEpoch), `d0a6dff` (review remediation and AgentRun guards).

## P03 notes

- Added `better-sqlite3@13.0.3` and `@types/better-sqlite3@9.6.0`; native load verified with Node 24 and Electron 41 on Windows x64 without rebuild.
- Database bootstrap enables WAL for file-backed databases, foreign keys and a busy timeout. Migrations are transactional/idempotent and create core entity, canonical event and import-history tables.
- EventStore uses `BEGIN IMMEDIATE`, per-aggregate monotonic sequence, optimistic concurrency and atomic batch append. Typed repositories enforce ownership FKs; artifacts persist metadata references only.
- The legacy artifact adapter uses a structural edge and has a P18 deletion criterion, so no legacy type enters V2.
- Task commits: `deeb6ec` (SQLite runtime), `7a78cc4` (migrations), `b0c0d9f` (EventStore), `708c7a3` (repositories/artifacts), `fa246e7` (review remediation for writer locking/indexing).

## P04 notes

- Finalized the versioned architecture envelope with timestamp and canonical correlation IDs; P03 EventStore maps it to the existing SQLite columns and validates loaded events.
- Zod runtime schemas cover durable event families and structured tool call/result payloads. The approved rules exception permits only `zod` under `src/shared/v2/schemas`.
- Stream assembly compacts text deltas, excludes reasoning/partial calls, preserves narrated tool-like prose as text, and rejects duplicate/orphan call IDs.
- Event factory uses injected Clock/IdGenerator and recursively redacts credential-like fields without mutating input.
- Task commits: `e0c1904` (schemas/EventStore/rules reconciliation), `a338a99` (assembler), `592c757` (factory/redaction), `a818fe3` (tool correlation and persisted schema validation).

## P05 notes

- Added secret-free provider/account/model/RuntimeTarget contracts, Zod schemas, and ProviderPort; multiple accounts remain independently enabled with no active-account singleton.
- V1 compatibility uses structural edge types, strips secrets, maps unknown health/capabilities conservatively, and has a P18 deletion criterion.
- Capability probes trust only structured tool events; narrated tool-like prose is DEGRADED, never VERIFIED.
- Router implements deterministic AUTO/PREFERRED/PINNED policy, capability filtering, quota/load scoring, frozen epoch-sticky targets and explicit epoch release.
- Task commits: `8742a48` (contracts/port), `a7bb22c` (V1 adapter), `2dc526c` (capability probe), `87621e7` (router), `289b8d4` (review remediation).
