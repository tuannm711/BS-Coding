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
| P07 | Tool execution and protocol guard | `d66b0df` | `npm run typecheck` + 4 P07 unit test files + boundary guard + production build green; full suite 1279 passing |
| P06 | Context compiler and RuntimeEpoch switching | `3bcd077` | `npm run typecheck` + 4 P06 unit test files + boundary guard + production build green; full suite 1288 passing |
| P08 | Agent runtime V2 | `ce8256d` | `npm run typecheck` + 5 P08 unit test files + boundary guard + production build green; full suite 1300 passing |
| P09 | Workflow and task graph engine | `89f50ac` | `npm run typecheck` + 4 P09 unit test files + boundary guard + production build green; full suite 1313 passing |
| P10 | Agent team and orchestrator | `e3d96d9` | `npm run typecheck` + 4 P10 unit test files + boundary guard + production build green; full suite 1323 passing |
| P11 | Git worktree integration | `43edf01` | `npm run typecheck` + P11 integration/unit tests + boundary guard + production build green; full suite 1332 passing |

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

## P07 notes

- Structured tool contracts require explicit call IDs, JSON object arguments and safety metadata. ProtocolGuard never parses AssistantText and rejects unknown tools, invalid args, duplicate calls and capability violations.
- Permission resolution follows hard-security → WorkSession → AgentVersion → Project → Global precedence; ASK persists an approval request before returning.
- ToolExecutor deduplicates concurrent calls and exposes a durable idempotency reservation port so restarts cannot replay completed side effects. Protocol reservations have explicit release lifecycle.
- V1 tool adapter is structural, gives known tools explicit metadata, defaults unknown tools to destructive/artifact policy, and has a P13 deletion criterion.
- Task commits: `8e6c234` (contracts/schemas), `f35bc76` (ProtocolGuard), `4816744` (permissions/approvals), `b35fb51` (executor/V1 adapter), `d66b0df` (durable idempotency remediation).

## P06 notes

- Context selection isolates TaskRun/AgentRun history and removes provider conversation IDs, native sessions, thought signatures and runtime context from cross-epoch state.
- ContextCompiler rebuilds deterministic provider-neutral packets from durable canonical events, system rules and artifact references after restart.
- RuntimeEpoch switching preserves WorkSession/AgentRun identity, closes the old epoch before starting the new target, emits ordered lifecycle records and runs inside an injected transaction boundary.
- Native projection keeps structured ToolCall/ToolResult history when supported; otherwise it emits neutral factual user records, never assistant tool-shaped prose.
- Task commits: `5f58955` (context policy), `63986df` (compiler), `5d2e013` (epoch switching), `0a70af4` (native projection), `3bcd077` (atomic switch remediation).

## P08 notes

- RuntimePort and stream parts are provider-neutral; the V1 LlmClient adapter structurally maps text/reasoning/tool/finish/error parts and drops provider thought signatures.
- AgentRunner owns only AgentRun step execution/outcomes, propagates abort signals to runtime/tool callbacks, enforces step limits and depends on an application port rather than workflow state/runtime implementation.
- Steering drains FIFO only at model step boundaries. Compaction produces an immutable canonical summary artifact/event plan without rewriting source history or provider-native state.
- Task commits: `a00c4e0` (runtime port), `7726751` (V1 LLM adapter), `ddf6077` (AgentRunner/service), `e7d895d` (steering/compaction), `ce8256d` (steering integration remediation).

## P09 notes

- Task graph validation rejects duplicate IDs, missing dependencies, cycles, missing acceptance criteria, unsatisfied capabilities, unresolved workspace conflicts and invalid quality-gate scopes.
- WorkflowEngine creates state only from approved valid plans, selects dependency-ready tasks deterministically and maps AgentRun outcomes copy-on-write; agents cannot persist task/workflow status directly.
- Pause/resume/cancel/recovery use named state transitions, preserve completed outputs and run lifecycle state plus AgentRun cancellation through an injected transaction boundary.
- Retry policy distinguishes transient same-attempt/new-epoch handoff from implementation retry with explicit TaskRun provenance.
- Task commits: `392fdbb` (DAG validation), `17cc25c` (WorkflowEngine), `a6c713e` (lifecycle controls), `39038a4` (retry policy), `89f50ac` (execution-constraint/atomicity remediation).

## P10 notes

- Eight immutable standard agent templates keep Security Reviewer and QA/Tester responsibilities distinct; templates remain data rather than hard-coded classes.
- Assignment service loads immutable AgentVersion references, persists an auditable assignment before dispatch and supplies a deep-frozen, self-contained TaskEnvelope with no hidden coordinator context.
- Orchestrator uses an explicit read/planning allowlist and default-denies unknown, write, shell and recursive worker tools; plan/task proposals cross the WorkflowEngine boundary.
- Admission policy uses only explicit concurrency/budget settings, returns ALLOW/ASK/BLOCK with projected spend, and invents no hard defaults.
- Task commits: `9d734ce` (profiles), `e67f766` (assignments), `1cd316d` (Orchestrator policy), `d31174d` (admission), `e3d96d9` (default-deny/immutability remediation).

## P11 notes

- WorkspacePort separates serializable workspace identity from Git operations; deterministic branch names are sanitized and write TaskRuns receive distinct branches/worktree paths.
- WorktreeManager uses Git CLI behind an infrastructure adapter, refuses cleanup of dirty/unmerged work and integration tests operate only on hermetic temporary repositories.
- IntegrationService merges approved branches in deterministic task order, models actual unmerged-file conflicts as explicit conflict tasks, propagates non-conflict Git failures and requests quality-gate reruns after successful integration.
- Cleanup requires merged/archived state, recorded audit and zero active references; removal is never forced and failures surface as warnings.
- Task commits: `1eabe7f` (WorkspacePort), `5824a6e` (worktree manager), `e022d7d` (integration), `02fdab5` (cleanup), `43edf01` (conflict classification/gate rerun remediation).
