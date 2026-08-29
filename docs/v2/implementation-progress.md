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
