# P15 backend projection and API prerequisite — design

Date: 2026-08-30  
Branch: `v2/p15-backend-projections`  
Status: design direction approved; written spec awaiting owner review

## 1. Problem

P15 requires renderer screens backed by real V2 projections and commands. The
current composition root registers `registerV2Ipc({ routes: [] })`, while
`window.bs.v2` exposes only WorkSession create/pause, provider account list and
Workflow get/subscribe. That is insufficient for Home, Project, Work, Agents,
Settings and the bottom panel.

The locked P15 plan explicitly forbids hard-coded workflow/demo state. The
missing backend surface must therefore land before renderer Tasks 2-5. This
spec does not change the locked V2 pack; it defines a prerequisite delivery
slice in the process archive.

## 2. Goals

- Expose every projection and consequential command P15 consumes through
  explicit JSON DTOs and strict Zod schemas.
- Build projections from durable V2 repositories/events and existing
  application services, never from renderer state or chat scraping.
- Enforce project/WorkSession ownership and workspace scope in main process.
- Make consequential commands request-idempotent, transactional and auditable.
- Register real routes when `BS_V2=1`; no placeholder handlers and no legacy
  `MainApp`/`BsAgentManager` dependency.
- Provide hermetic contract, repository, application, IPC/preload and E2E tests.

## 3. Non-goals

- No renderer components, CSS, Figma interpretation or navigation changes.
- No V1 cutover, V1 data import or removal of `window.api`.
- No provider/model calls, real agents or network dependency in tests.
- No new domain lifecycle invented for UI convenience. If a requested command
  lacks a legal domain/application transition, the route remains unavailable
  until that transition is specified and approved.
- No raw filesystem handles, process objects, secrets, provider clients or
  database rows cross preload.

## 4. Chosen architecture

### 4.1 Small screen-scoped projections

Use explicit queries per screen or tab instead of a single mega projection.
Renderer may load independent queries in parallel. A Git/LSP/MCP failure can
then produce a typed unavailable state for its tab without invalidating the
Project or WorkSession identity projection.

Projection DTOs live in `src/shared/v2/contracts/ui-projections.ts`; schemas
live in `src/shared/v2/schemas/ui-projections.ts`. Contracts contain data only.
Every DTO includes stable entity IDs and a projection `revision`; list order is
deterministic.

### 4.2 Application projection services

Application query services live under
`src/main/v2/application/projections/`. They depend on narrow read ports, not
SQLite, Electron, Git, MCP/LSP implementations or renderer modules.

Infrastructure implements the read ports with SQLite repositories, EventStore,
WorkspacePort, ProviderPort, MCP/LSP ports and artifact metadata. Repository
list methods are owner-scoped (`projectId`, `workSessionId`, `workflowRunId`),
not unrestricted table scans.

### 4.3 Command services

IPC routes call application command services. Existing lifecycle, runtime,
review and workflow services remain the transition owners. An IPC handler does
not update repository records directly.

Every consequential command uses its `requestId` through a
`CommandIdempotencyPort`. The SQLite implementation records request ID,
command name, normalized result and completion state in the same transaction
as the state transition/event append. Replaying a completed request returns
the stored result; an in-progress duplicate is rejected deterministically.

### 4.4 Composition and publication

The V2 composition root opens the V2 database, creates repositories, read
ports, application services and concrete routes, then passes those routes to
`registerV2Ipc`. Projection events publish only after the transaction commits.
Sequence is connection-local and monotonic; revision comes from durable
projection state. On restart or sequence gaps the renderer refetches.

## 5. Public backend surface required by P15

All names below extend the existing `bs.v2.*` registry and have request,
response and event schemas.

### 5.1 Home and Project

| Contract | Result / behavior |
|---|---|
| `project.list` | project summaries ordered by recent activity then ID |
| `project.get` | project identity/instructions summary |
| `workSession.listByProject` | status/progress/attention summaries |
| `workspace.get` | scoped workspace identity and file-tree summary |
| `git.status` | branch, dirty state and changed-file summary |
| `agent.listByProject` | project AgentDefinition/current-version summaries |
| `skill.list` | resolved project bindings and immutable version/hash refs |
| `mcp.listServers` | masked server status/tool names; no environment values |

Home composes `project.list`, recent WorkSessions and the existing secret-free
provider account summaries. Project tabs load their own query on demand.

### 5.2 WorkSession and Workflow

| Contract | Result / behavior |
|---|---|
| `workSession.get` | WorkSession identity, lifecycle status and active workflow |
| `workflow.get` | current WorkflowRun summary (already defined) |
| `workflow.conversation` | canonical messages/runtime events only |
| `workflow.plan` | PlanVersion and approval state |
| `workflow.tasks` | DAG tasks, TaskRuns and assignments |
| `workflow.execution` | AgentRun/TaskRun execution graph |
| `workflow.changes` | ChangeSet/artifact/diff metadata, not raw handles |
| `workflow.review` | gates, reviews, findings and linked rework tasks |
| `workflow.runtimeHistory` | ordered RuntimeEpoch summaries |
| `workflow.projection` | scoped sequence/revision event (already defined) |

Consequential commands are `workSession.pause`, `workSession.resume`,
`workSession.cancel`, `workSession.switchRuntime`, `workflow.approvePlan` and
`workflow.createRework`. Pause already exists at the preload contract; all other
commands are added only by delegating to their named application/domain
service.

### 5.3 Agents and Settings

| Contract | Result / behavior |
|---|---|
| `agent.list` / `agent.get` | global definitions and immutable versions |
| `provider.listAccounts` | existing secret-free account summaries |
| `settings.get` | global/project scope settings DTO with vault refs masked |
| `settings.update` | validated draft patch through application service |
| `diagnostics.list` | project/workflow-scoped diagnostics and evidence refs |
| `remote.status` | safe remote status; never tokens/pairing secrets |

Agent add/edit/enable/remove and provider connect/refresh/enable/probe require
separate named command schemas. Secret entry travels renderer → preload → main
only as command input and terminates in the vault; no response/event echoes it.

### 5.4 Bottom panel

| Contract | Projection source |
|---|---|
| `workflow.terminals` | PTY session summaries/IDs, not process handles |
| `workflow.tests` | test-run artifacts and gate results |
| `workflow.problems` | LSP diagnostics plus review findings |
| `workflow.logs` | structured canonical/audit event summaries |
| `workflow.output` | runtime/tool output artifact references and safe previews |

Terminal input/resize remains an explicit command surface owned by main. The
panel never becomes primary navigation.

## 6. Projection consistency and ownership

- Query services verify the complete ownership chain from project to
  WorkSession/WorkflowRun before reading child records.
- Cross-project IDs return a normalized not-found/forbidden result without
  revealing whether the foreign entity exists.
- Composite DTO sections include `AVAILABLE | EMPTY | UNAVAILABLE` when an
  optional client such as Git, MCP or LSP is offline. Required identity records
  use normalized IPC errors.
- Event payloads are strict DTOs and are scoped by WorkflowRun ID in preload.
- Renderer treats projections as immutable snapshots and never writes status
  fields locally.

## 7. Error and security policy

- Zod validates requests at main ingress and responses/events before they
  cross preload.
- Internal errors are logged only with redaction in main; renderer receives a
  stable code and generic safe message.
- Vault-backed fields expose `configured: boolean` or a vault reference label,
  never secret bytes.
- File/Git operations resolve paths inside the selected workspace before I/O.
- Query failure has no side effect. Command failure rolls back transition,
  event append and idempotency result together.

## 8. Delivery decomposition

The prerequisite is implemented sequentially on its dedicated
`v2/p15-backend-projections` branch because every slice extends the same shared
IPC registry.

1. **Projection foundation** — DTO/schema vocabulary, owner-scoped read ports,
   repository list/query support, command-idempotency port/migration.
2. **Home/Project surface** — Project/WorkSession/workspace/Git/agent/skill/MCP
   queries and preload methods.
3. **Work surface** — conversation/plan/tasks/execution/changes/review/runtime
   projections and lifecycle/runtime/rework commands.
4. **Agents/Settings/Bottom surface** — safe settings/provider/agent commands
   and bottom-panel projections.
5. **Composition and E2E** — real router assembly, projection publication,
   temp SQLite/project fixtures and backend core-flow tests.

Each slice follows RED → GREEN → relevant regression/typecheck → independent
commit. No renderer code starts until its required slice is green.

## 9. Testing and completion gate

- Contract tests assert every public API method has explicit request/response
  or event schemas and contains no forbidden raw field.
- Repository integration tests use temporary SQLite databases and prove owner
  filtering, ordering and request-id replay.
- Application tests use deterministic clocks/IDs and real projection builders
  over fakes; no model/provider calls.
- IPC/preload tests prove validation, safe errors, method/channel parity and
  subscription scoping.
- E2E backend tests launch Electron with `BS_V2=1`, seed temp V2 SQLite/project
  state and exercise queries/commands without rendering P15 screens.
- Completion requires `npm run typecheck`, focused prerequisite tests,
  production build, full `npm test` and full `npm run e2e`.

## 10. Relationship to P15 and remaining blocker

After this prerequisite is implemented, P15 screens may consume only the
public APIs defined here. Figma design-to-code remains independently blocked:
before any renderer implementation, the task still needs a node-specific Figma
Design URL and an available `get_design_context` tool. The existing Figma Make
file-only link is insufficient and is not replaced by screenshots or guesses.
