# P15 Backend Projection Prerequisite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide the durable, owner-scoped V2 projections, idempotent commands and real typed IPC/preload routes required by the locked P15 renderer plan.

**Architecture:** Small screen-scoped projections are built by application services over narrow read ports and durable V2 repositories. Consequential commands delegate to existing transition owners through a SQLite-backed request-idempotency boundary; the composition root registers concrete validated routes and preload validates every response/event.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Zod 4, better-sqlite3/WAL, Vitest 4, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-30-p15-backend-projection-prerequisite-design.md`

**Local UX reference:** `docs/v2/prototype/README.md` and `docs/v2/prototype/figma-make/`. Read-only behavior/layout reference; never copy the sandbox wholesale or run its package manager.

## Global Constraints

- Work only on `v2/p15-backend-projections`; do not commit to `master`.
- Keep V2 beside V1; do not import `MainApp`, `BsAgentManager`, Electron, SQLite or renderer code into application services.
- Shared contracts are JSON data only; external request/response/event boundaries use strict Zod schemas.
- Every child query verifies Project → WorkSession → WorkflowRun ownership without revealing foreign entity existence.
- Consequential commands use request IDs, transactions and durable idempotency; handlers never mutate repositories directly.
- No secret, raw filesystem/process handle, provider client or database row crosses preload.
- No real LLM/provider/agent dependency in automated tests.
- After any IPC change, update registry, schemas, main routes, preload surface, renderer type and IPC/preload tests together.
- Each task follows RED → observed failure → minimal GREEN → relevant regression/typecheck → independent commit.

## Locked cross-task interfaces

Use these names throughout Tasks 1–7. Do not create aliases with different
semantics.

```ts
export interface CommandIdempotencyPort {
  reserve(requestId: string, commandName: string): Promise<
    | { status: 'RESERVED' }
    | { status: 'IN_PROGRESS' }
    | { status: 'COMPLETED'; result: unknown }
  >
  complete(requestId: string, commandName: string, result: unknown): Promise<void>
  release(requestId: string, commandName: string): Promise<void>
}

export function runIdempotentCommand<T>(deps: {
  idempotency: CommandIdempotencyPort
  transaction<R>(operation: () => Promise<R>): Promise<R>
}, requestId: string, commandName: string, operation: () => Promise<T>): Promise<T>

export interface ProjectionSupportPort {
  getWorkspace(projectId: string): Promise<ProjectionSection<WorkspaceSummary>>
  getGitStatus(projectId: string): Promise<ProjectionSection<GitSummary>>
  listProviderAccounts(): Promise<readonly ProviderAccountSummary[]>
  listMcpServers(projectId: string): Promise<ProjectionSection<readonly McpServerDescriptor[]>>
  listDiagnostics(projectId: string, workflowRunId?: string): Promise<ProjectionSection<readonly ProblemSummary[]>>
}
```

The public registry/preload surface added by Task 6 is exactly:

```text
project.list, project.get
workSession.listByProject, workSession.get, workSession.create,
workSession.pause, workSession.resume, workSession.cancel,
workSession.switchRuntime
workflow.get, workflow.conversation, workflow.plan, workflow.tasks,
workflow.execution, workflow.changes, workflow.review,
workflow.runtimeHistory, workflow.bottomPanel, workflow.approvePlan,
workflow.createRework, workflow.projection
agent.list, agent.listByProject, agent.get, agent.create, agent.update,
agent.remove
provider.listAccounts, provider.connect, provider.refresh,
provider.setEnabled, provider.probe
workspace.get, git.status, skill.list, mcp.listServers,
settings.get, settings.update, diagnostics.list, remote.status
```

Terminal write/resize stays out of this prerequisite: the bottom projection
returns terminal session IDs only; P15 may reuse the existing V1 PTY bridge
until the plan 20 cutover or a later approved V2 terminal command contract.

---

### Task 1: Define projection DTOs, schemas and read ports

**Files:**
- Create: `src/shared/v2/contracts/ui-projections.ts`
- Create: `src/shared/v2/schemas/ui-projections.ts`
- Create: `src/main/v2/application/ports/projection-read-port.ts`
- Create: `src/main/v2/application/ports/projection-support-port.ts`
- Test: `tests/unit/v2/ui-projection-contract.test.ts`

**Interfaces:**
- Consumes: `Project`, `WorkSession`, `WorkflowRun`, Task/Agent/Runtime/Review, provider, skill, MCP, LSP and artifact contracts.
- Produces: `ProjectSummary`, `WorkSessionSummary`, `ProjectDetailProjection`, `WorkProjection`, `AgentSettingsProjection`, `BottomPanelProjection`, `ProjectionSection<T>` and `ProjectionReadPort` owner-scoped reads.

- [ ] **Step 1: Write the failing contract test**

```ts
import { expect, it } from 'vitest'
import { ProjectSummarySchema, WorkProjectionSchema } from '../../../src/shared/v2/schemas/ui-projections'

it('requires stable ids, revision and typed unavailable sections', () => {
  expect(ProjectSummarySchema.safeParse({ id: 'p', name: 'PMS' }).success).toBe(false)
  expect(WorkProjectionSchema.safeParse({ workflowRunId: 'wf', revision: 4,
    tasks: { status: 'UNAVAILABLE', errorCode: 'OFFLINE' } }).success).toBe(true)
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/ui-projection-contract.test.ts`  
Expected: FAIL because projection contracts/schemas do not exist.

- [ ] **Step 3: Implement the minimal DTO vocabulary**

```ts
export type ProjectionSection<T> =
  | { status: 'AVAILABLE'; value: T }
  | { status: 'EMPTY' }
  | { status: 'UNAVAILABLE'; errorCode: string }

export interface ProjectSummary {
  id: string; name: string; repoPath: string; defaultBranch: string
  activeWorkCount: number; updatedAt: string; revision: number
}

export interface ProjectionReadPort {
  listProjects(): Promise<readonly Project[]>
  listWorkSessionsByProject(projectId: string): Promise<readonly WorkSession[]>
  getWorkflowOwnedByProject(projectId: string, workflowRunId: string): Promise<WorkflowRun | null>
}
```

Define every DTO field used by spec sections 5.1–5.4 and mirror it with strict Zod. Reuse existing domain unions rather than duplicating status strings in application code.

- [ ] **Step 4: Run GREEN and boundary regression**

Run: `npx vitest run tests/unit/v2/ui-projection-contract.test.ts tests/unit/v2/module-boundaries.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/v2/contracts/ui-projections.ts src/shared/v2/schemas/ui-projections.ts src/main/v2/application/ports/projection-read-port.ts src/main/v2/application/ports/projection-support-port.ts tests/unit/v2/ui-projection-contract.test.ts
git commit -m "feat(v2): define P15 backend projection contracts"
```

### Task 2: Add owner-scoped reads and durable command idempotency

**Files:**
- Create: `src/main/v2/application/ports/command-idempotency-port.ts`
- Create: `src/main/v2/application/commands/idempotent-command.ts`
- Create: `src/main/v2/infrastructure/persistence/migrations/003-projections-idempotency.sql`
- Modify: `src/main/v2/infrastructure/persistence/repositories.ts`
- Modify: `src/main/v2/infrastructure/persistence/migration-runner.ts`
- Test: `tests/unit/v2/projection-repositories.test.ts`
- Test: `tests/unit/v2/command-idempotency.test.ts`

**Interfaces:**
- Consumes: Task 1 `ProjectionReadPort`, SQLite migrations and repositories.
- Produces: deterministic owner-filtered list methods and `runIdempotentCommand<T>(requestId, commandName, operation)`.

- [ ] **Step 1: Write failing repository/idempotency tests**

```ts
it('never returns sessions owned by another project', async () => {
  expect(await reads.listWorkSessionsByProject('p1')).toEqual([sessionP1])
})

it('replays a completed request without repeating the transition', async () => {
  const first = await service.run('req-1', 'workSession.pause', operation)
  const replay = await service.run('req-1', 'workSession.pause', operation)
  expect(replay).toEqual(first)
  expect(operation).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/projection-repositories.test.ts tests/unit/v2/command-idempotency.test.ts`  
Expected: FAIL because scoped reads/table/service do not exist.

- [ ] **Step 3: Add migration and minimal implementation**

Migration table:

```sql
CREATE TABLE command_idempotency (
  request_id TEXT NOT NULL,
  command_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('IN_PROGRESS','COMPLETED')),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY(request_id, command_name)
);
```

Add owner-column indexes for every new scoped read. Use prepared statements and parse stored `payload_json` through the relevant schema before returning it. The idempotency adapter must use the same injected transaction as the command transition; do not open a nested independent transaction.

Implement `runIdempotentCommand` exactly as declared in “Locked cross-task
interfaces”: `COMPLETED` returns its parsed stored result, `IN_PROGRESS`
throws code `COMMAND_IN_PROGRESS`, success calls `complete` in the transaction,
and failure calls `release` so an explicit retry may execute again.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/unit/v2/projection-repositories.test.ts tests/unit/v2/command-idempotency.test.ts tests/unit/v2/migrations.test.ts tests/unit/v2/repositories.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/v2/application/ports/command-idempotency-port.ts src/main/v2/application/commands/idempotent-command.ts src/main/v2/infrastructure/persistence/migrations/003-projections-idempotency.sql src/main/v2/infrastructure/persistence/repositories.ts src/main/v2/infrastructure/persistence/migration-runner.ts tests/unit/v2/projection-repositories.test.ts tests/unit/v2/command-idempotency.test.ts
git commit -m "feat(v2): persist owner-scoped reads and command replay"
```

### Task 3: Implement Home and Project projection services

**Files:**
- Create: `src/main/v2/application/projections/project-projections.ts`
- Create: `src/main/v2/application/projections/optional-section.ts`
- Test: `tests/unit/v2/project-projections.test.ts`

**Interfaces:**
- Consumes: `ProjectionReadPort` and `ProjectionSupportPort` from Task 1.
- Produces: `listHomeProjection()`, `getProjectDetail(projectId)`, `getProjectWorkspace(projectId)` with deterministic ordering and typed optional sections.

- [ ] **Step 1: Write the failing behavior test**

```ts
it('orders recent projects and degrades only the offline MCP section', async () => {
  const home = await service.listHomeProjection()
  expect(home.projects.map(project => project.id)).toEqual(['recent', 'older'])
  const detail = await service.getProjectDetail('recent')
  expect(detail.mcp).toEqual({ status: 'UNAVAILABLE', errorCode: 'MCP_OFFLINE' })
  expect(detail.workSessions.status).toBe('AVAILABLE')
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/project-projections.test.ts`  
Expected: FAIL because the projection service does not exist.

- [ ] **Step 3: Implement minimal projection builders**

Load independent optional sections with `Promise.allSettled`; convert only optional client failures to `UNAVAILABLE`. Missing Project identity throws the same safe not-found error used for foreign ownership. Sort by literal `updatedAt DESC, id ASC` behavior and freeze returned arrays/objects.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/unit/v2/project-projections.test.ts tests/unit/v2/ui-projection-contract.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/v2/application/projections/project-projections.ts src/main/v2/application/projections/optional-section.ts tests/unit/v2/project-projections.test.ts
git commit -m "feat(v2): build Home and Project projections"
```

### Task 4: Implement Work projections and idempotent lifecycle commands

**Files:**
- Create: `src/main/v2/application/projections/work-projections.ts`
- Create: `src/main/v2/application/commands/work-session-commands.ts`
- Modify: `src/main/v2/application/workflow/lifecycle-service.ts`
- Modify: `src/main/v2/application/runtime/runtime-epoch-service.ts`
- Modify: `src/main/v2/application/review/rework-service.ts`
- Test: `tests/unit/v2/work-projections.test.ts`
- Test: `tests/integration/v2/work-session-commands.test.ts`

**Interfaces:**
- Consumes: canonical EventStore, Task/Run/Epoch/Review/Finding/artifact reads, existing transition services and Task 2 idempotency.
- Produces: conversation/plan/tasks/execution/changes/review/runtime-history projections and pause/resume/cancel/switchRuntime/approvePlan/createRework command facade.

- [ ] **Step 1: Write failing projection and command tests**

```ts
it('projects runtime epochs as explicit ordered separators', async () => {
  const work = await service.getConversation('p1', 'wf1')
  expect(work.items).toContainEqual(expect.objectContaining({
    kind: 'RUNTIME_CHANGED', fromEpochId: 'epoch-1', toEpochId: 'epoch-2'
  }))
})

it('replays pause by request id without cancelling agents twice', async () => {
  await commands.pause({ requestId: 'r1', projectId: 'p1', workSessionId: 'ws1' })
  await commands.pause({ requestId: 'r1', projectId: 'p1', workSessionId: 'ws1' })
  expect(cancelActiveAgentRuns).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/work-projections.test.ts tests/integration/v2/work-session-commands.test.ts`  
Expected: FAIL because services/facade do not exist.

- [ ] **Step 3: Implement minimal services**

Use canonical events for conversation/tool/runtime rows; never parse assistant prose. Apply owner validation before every child read. Command facade maps WorkSession IDs to their active WorkflowRun/AgentRun and calls existing lifecycle/runtime/rework services inside the idempotent transaction. Add only the existing legal transitions; plan approval delegates to WorkflowEngine and persists its named event.

- [ ] **Step 4: Run GREEN and state-machine regression**

Run: `npx vitest run tests/unit/v2/work-projections.test.ts tests/integration/v2/work-session-commands.test.ts tests/unit/v2/workflow-state.test.ts tests/unit/v2/workflow-lifecycle.test.ts tests/unit/v2/runtime-epoch-service.test.ts tests/integration/v2/rework-lifecycle.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/v2/application/projections/work-projections.ts src/main/v2/application/commands/work-session-commands.ts src/main/v2/application/workflow/lifecycle-service.ts src/main/v2/application/runtime/runtime-epoch-service.ts src/main/v2/application/review/rework-service.ts tests/unit/v2/work-projections.test.ts tests/integration/v2/work-session-commands.test.ts
git commit -m "feat(v2): expose durable Work projections and commands"
```

### Task 5: Implement Agents, Settings and bottom-panel projections

**Files:**
- Create: `src/main/v2/application/projections/agent-settings-projections.ts`
- Create: `src/main/v2/application/projections/bottom-panel-projections.ts`
- Create: `src/main/v2/application/commands/agent-settings-commands.ts`
- Test: `tests/unit/v2/agent-settings-projections.test.ts`
- Test: `tests/unit/v2/bottom-panel-projections.test.ts`

**Interfaces:**
- Consumes: AgentDefinition/Version, provider account, skill/MCP/LSP, artifact/event/audit and safe settings/vault edges.
- Produces: global/project scoped Agent/Settings DTOs, safe provider actions and Terminal/Tests/Problems/Logs/Output projections.

- [ ] **Step 1: Write failing scope/security tests**

```ts
it('never emits vault values or project Agents in global settings', async () => {
  const settings = await service.getGlobalSettings()
  expect(settings).not.toHaveProperty('agents')
  expect(JSON.stringify(settings)).not.toContain('secret-value')
})

it('keeps each bottom tab on its declared source', async () => {
  const panel = await bottom.get('p1', 'wf1')
  expect(panel.tests.items[0].artifactId).toBe('test-artifact')
  expect(panel.problems.items[0].kind).toBe('LSP_DIAGNOSTIC')
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/agent-settings-projections.test.ts tests/unit/v2/bottom-panel-projections.test.ts`  
Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement minimal projections/commands**

Return vault state as `{ configured: boolean }`. Provider/agent commands delegate to ports and never echo secret input. Terminal entries contain IDs/title/status only. Logs/output use redacted event previews and artifact IDs; cap every list with an explicit request limit and deterministic order.

The command service methods are named `createAgent`, `updateAgent`,
`removeAgent`, `connectProvider`, `refreshProvider`, `setProviderEnabled`,
`probeProvider` and `updateSettings`. Each accepts a request ID and the owning
scope ID; each calls `runIdempotentCommand`.

- [ ] **Step 4: Run GREEN**

Run: `npx vitest run tests/unit/v2/agent-settings-projections.test.ts tests/unit/v2/bottom-panel-projections.test.ts tests/unit/v2/event-redaction.test.ts tests/unit/v2/extension-contracts.test.ts && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/v2/application/projections/agent-settings-projections.ts src/main/v2/application/projections/bottom-panel-projections.ts src/main/v2/application/commands/agent-settings-commands.ts tests/unit/v2/agent-settings-projections.test.ts tests/unit/v2/bottom-panel-projections.test.ts
git commit -m "feat(v2): project agents settings and bottom panel state"
```

### Task 6: Extend typed IPC/preload and assemble real V2 routes

**Files:**
- Modify: `src/shared/v2/contracts/ipc.ts`
- Modify: `src/shared/v2/schemas/ipc.ts`
- Modify: `src/preload/v2-api.ts`
- Modify: `src/renderer/src/env.d.ts`
- Create: `src/main/v2/ipc/create-v2-routes.ts`
- Create: `src/main/v2/application/create-v2-services.ts`
- Modify: `src/main/v2/application/v2-bootstrap.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/v2/p15-backend-ipc-contract.test.ts`
- Test: `tests/integration/v2/p15-backend-routes.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–5 projection/command services.
- Produces: complete `BsV2Api`, strict schema parity, concrete route list and runtime disposal for database/routes/publishers.

- [ ] **Step 1: Write failing parity and route tests**

```ts
it('has a schema and registered route for every public method', () => {
  expect(publicApiKeys()).toEqual(publicSchemaKeys())
  expect(routeChannels()).toEqual(publicInvokeChannels())
})

it('serves seeded Project data through a real validated route', async () => {
  await expect(invoke(V2_IPC.project.get, { id: 'p1' }))
    .resolves.toMatchObject({ id: 'p1', name: 'PMS' })
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/v2/p15-backend-ipc-contract.test.ts tests/integration/v2/p15-backend-routes.test.ts`  
Expected: FAIL because registry/preload/composition do not expose the new surface.

- [ ] **Step 3: Implement the typed surface and composition**

Add registry names from spec section 5 under existing families only. For every public method add request/response/event schema, concrete return type, preload parser and `defineV2IpcRoute`. Replace `routes: []` with `createV2Routes(services)`. V2 bootstrap owns and disposes the database, handler cleanup and publishers; disabled V2 still starts no resource.

Extend the existing `BS_V2=1` smoke assertion to invoke `project.list` and verify the returned DTO contains no forbidden raw field.

- [ ] **Step 4: Run GREEN, build and focused E2E**

Run: `npm run typecheck && npx vitest run tests/unit/v2/p15-backend-ipc-contract.test.ts tests/integration/v2/p15-backend-routes.test.ts tests/unit/v2/ipc-contract.test.ts tests/unit/v2/preload-contract.test.ts tests/unit/v2/module-boundaries.test.ts && npm run build && npx playwright test tests/e2e/smoke.spec.ts --grep "V2 IPC bootstrap"`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/v2/contracts/ipc.ts src/shared/v2/schemas/ipc.ts src/preload/v2-api.ts src/renderer/src/env.d.ts src/main/v2/ipc/create-v2-routes.ts src/main/v2/application/create-v2-services.ts src/main/v2/application/v2-bootstrap.ts src/main/index.ts tests/unit/v2/p15-backend-ipc-contract.test.ts tests/integration/v2/p15-backend-routes.test.ts tests/e2e/smoke.spec.ts
git commit -m "feat(v2): assemble P15 backend API surface"
```

### Task 7: Prove backend core flow in Electron

**Files:**
- Create: `tests/e2e/v2-backend-projections.spec.ts`
- Create: `tests/fixtures/v2-seed.ts`
- Modify: `docs/CURRENT-WORK.md`

**Interfaces:**
- Consumes: complete typed API from Task 6 and temporary V2 SQLite/project fixtures.
- Produces: Electron evidence for project → work projections → pause/resume → runtime switch → review/rework plus completion gate evidence.

- [ ] **Step 1: Write the failing E2E flow**

```ts
test('V2 backend projections and commands survive restart', async () => {
  const before = await window.evaluate(() => window.bs.v2.project.get('p1'))
  expect(before.name).toBe('PMS')
  await window.evaluate(() => window.bs.v2.workSession.pause('ws1'))
  await app.close()
  const after = await relaunchAndGetWorkSession(userData, 'ws1')
  expect(after.status).toBe('PAUSED')
})
```

The fixture writes only temp V2 SQLite/project data and uses deterministic IDs/timestamps; cleanup always closes Electron/database before recursive removal.

- [ ] **Step 2: Run RED**

Run: `npm run build && npx playwright test tests/e2e/v2-backend-projections.spec.ts`  
Expected: FAIL until the complete real route/composition flow is reachable.

- [ ] **Step 3: Complete only missing composition/fixture wiring**

Do not add renderer demo state. Fix route/service/seed ownership discovered by the E2E flow. Add no production behavior that lacks a focused lower-level test.

- [ ] **Step 4: Run plan completion gate**

Run:

```bash
npm run typecheck
npx vitest run tests/unit/v2/ui-projection-contract.test.ts tests/unit/v2/projection-repositories.test.ts tests/unit/v2/command-idempotency.test.ts tests/unit/v2/project-projections.test.ts tests/unit/v2/work-projections.test.ts tests/integration/v2/work-session-commands.test.ts tests/unit/v2/agent-settings-projections.test.ts tests/unit/v2/bottom-panel-projections.test.ts tests/unit/v2/p15-backend-ipc-contract.test.ts tests/integration/v2/p15-backend-routes.test.ts tests/unit/v2/module-boundaries.test.ts
npm run build
npm test
npm run e2e
```

Expected: all commands exit 0; no real provider/agent is contacted.

- [ ] **Step 5: Commit E2E evidence**

```bash
git add tests/e2e/v2-backend-projections.spec.ts tests/fixtures/v2-seed.ts docs/CURRENT-WORK.md
git commit -m "test(v2): prove P15 backend projection flow"
```

## Review and handoff gate

After Task 7, perform inline review for ownership leaks, secret/raw-handle exposure, direct repository mutation by IPC, idempotency races, unbounded projection lists and narrated-tool parsing. Remediate every P0–P2 finding through RED/GREEN and a separate commit. Record the final completion SHA in `docs/v2/implementation-progress.md`, update `docs/CURRENT-WORK.md` to awaiting merge, then stop for owner merge approval.

After merge and post-merge verification, return to `v2/p15-renderer-ui-figma`; renderer implementation reads the vendored prototype paths above and calls only the APIs delivered by this prerequisite.
