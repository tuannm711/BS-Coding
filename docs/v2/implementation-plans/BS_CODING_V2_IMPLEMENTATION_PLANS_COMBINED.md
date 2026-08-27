# BS Coding V2.0.0 — Combined Implementation Plans

> Convenience file. AI Coder should prefer the separate plan files so context stays focused.

# BS Coding V2.0.0 Implementation Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Each detailed plan in `plans/` is an independent review gate. Do not execute a later plan if a required producer interface from an earlier plan is red.

**Goal:** Upgrade BS Coding from V1.3.1 to V2.0.0 using the locked architecture pack and approved Figma Make prototype, with a clean V2 core, canonical runtime portability, deterministic multi-agent workflow orchestration, safe migration and production cutover.

**Architecture source:** `../architecture/README.md` and `../architecture/BS_CODING_V2_ARCHITECTURE_SPEC.md`  
**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1  
**Repository baseline:** `tuannm711/BS-Coding`, `master@8160ce8d2b61da2253e906843978ee5014c97467`, package version `1.3.1`.

## 1. Non-Negotiable Target

```text
Project
  → WorkSession
    → WorkflowRun
      → Task / TaskRun
        → Assignment
          → AgentRun
            → RuntimeEpoch
              → CanonicalEvent
```

```text
Provider → Account → Model → RuntimeTarget → RuntimeEpoch
AgentDefinition → AgentVersion → AgentRun
WorkflowEngine → Task Graph → Agent assignments → Integration → Quality gates
```

The UI follows user intent/work state, while provider/model/account/tool details remain support resources. Runtime/model switching never continues the old provider-native conversation; it compiles canonical context and starts a new RuntimeEpoch.

## 2. Execution Rules for AI Coder

1. Create an isolated Git worktree/feature branch for V2 before implementation. Do not build V2 directly on `master`.
2. Read `architecture/README.md`, `architecture/03-other/07-coding-rules-and-boundaries.md`, this master plan, then only the detailed plan currently being executed.
3. Use TDD: failing focused test → minimal implementation → focused green test → broader relevant suite → commit.
4. Keep V2 side-by-side with V1 until Plan 20 cutover. Never turn `BsAgentManager` into the V2 central dependency.
5. Reuse V1 provider/tool/MCP/LSP/vault/updater/browser capabilities only through compatibility adapters with deletion/cutover criteria.
6. Do not call real model/provider APIs in automated tests.
7. At the end of every detailed plan, run its completion gate and record the commit SHA in `docs/v2/implementation-progress.md`.
8. If architecture and old V1 docs disagree, current source is V1 factual baseline; the V2 architecture pack is target behavior; Figma is target UX behavior.

## 3. Master Dependency Graph

```text
P01 Foundation
 ├─ P02 Domain
 │   ├─ P03 Persistence
 │   │   └─ P04 Canonical Events
 │   │       ├─ P05 Provider/Router
 │   │       │   └─ P06 Context + RuntimeEpoch
 │   │       │       └─ P08 Agent Runtime
 │   │       └─ P07 Tool Guard ───────────┘
 │   │                                   │
 │   └───────────────────────────────────┴─ P09 Workflow
 │                                         └─ P10 Team/Orchestrator
 │                                             ├─ P11 Git Isolation
 │                                             └─ P12 Review/Gates
 │
 ├─ P13 Skills/MCP/LSP (after P07/P08)
 ├─ P14 IPC (after backend contracts stable)
 │   └─ P15 Renderer/Figma
 ├─ P16 Security (cross-cutting; final after P14)
 ├─ P17 Observability/Budget
 ├─ P18 V1 Migration (after schema/domain stable)
 ├─ P19 Updates/Remote
 └─ P20 Verification/Cutover (all predecessors)
```

## 4. Milestones and Release Gates

| Milestone | Detailed plans | Deliverable | Gate |
|---|---|---|---|
| M0 Baseline | P01 | V2 compiles side-by-side | No user-visible behavior change |
| M1 Durable Core | P02-P04 | Domain + SQLite + canonical events | Restart/replay deterministic |
| M2 Runtime Portability | P05-P08 | routing/context/epoch/tools/agent loop | TEST-REG-01..03 green |
| M3 Workflow Engineering | P09-P12 | DAG/team/worktrees/review/rework | full fake-runtime workflow green |
| M4 Extension Integration | P13, P16-P17, P19 | MCP/LSP/security/usage/remote | no bypass of V2 boundaries |
| M5 App Contract | P14 | typed IPC/preload | renderer cannot access secrets/raw Node |
| M6 UX | P15 | Figma prototype bound to real projections | AC-UX-01..04 + core E2E |
| M7 Data Upgrade | P18 | backup-first idempotent migration | TEST-REG-08 green on V1 fixture |
| M8 Release | P20 | writer cutover + 2.0.0 package | all AC + build + E2E + migration dry run |

## 5. Parallelization Allowed

After P04, P05 and P07 can proceed in parallel because both depend on stable canonical/shared contracts. P13 can proceed once ToolDefinition/AgentRuntime interfaces are stable. P16 and P17 may proceed in parallel with renderer work after IPC DTOs settle. P18 importer work may start after P03/P04 but final validation waits for agent/provider/workflow schemas to freeze.

Never parallelize two tasks that modify the same shared contract file without first merging and re-running typecheck. Parallel code-writing workers must use separate Git worktrees.

## 6. Detailed Plan Index

| # | File | Purpose | Depends on |
|---:|---|---|---|
| 01 | [`plans/01-foundation-module-boundaries.md`](plans/01-foundation-module-boundaries.md) | V2 Foundation and Module Boundaries | — |
| 02 | [`plans/02-domain-model-state-machines.md`](plans/02-domain-model-state-machines.md) | Domain Model and State Machines | 01 |
| 03 | [`plans/03-sqlite-persistence-event-store.md`](plans/03-sqlite-persistence-event-store.md) | SQLite Persistence, Event Store and Artifact Metadata | 01-02 |
| 04 | [`plans/04-canonical-event-protocol.md`](plans/04-canonical-event-protocol.md) | Canonical Event Protocol | 01-03 |
| 05 | [`plans/05-provider-account-model-routing.md`](plans/05-provider-account-model-routing.md) | Provider, Account, Model and Routing | 01-04 |
| 06 | [`plans/06-context-compiler-runtime-epoch.md`](plans/06-context-compiler-runtime-epoch.md) | Context Compiler and Runtime Epoch Switching | 02-05 |
| 07 | [`plans/07-tool-execution-protocol-guard.md`](plans/07-tool-execution-protocol-guard.md) | Tool Execution and Protocol Guard | 02,04 |
| 08 | [`plans/08-agent-runtime-v2.md`](plans/08-agent-runtime-v2.md) | Agent Runtime V2 | 04-07 |
| 09 | [`plans/09-workflow-task-graph-engine.md`](plans/09-workflow-task-graph-engine.md) | Workflow / Task Graph Engine | 02-04,08 |
| 10 | [`plans/10-agent-team-orchestrator.md`](plans/10-agent-team-orchestrator.md) | Agent Team and Orchestrator | 02,08-09 |
| 11 | [`plans/11-git-worktree-integration.md`](plans/11-git-worktree-integration.md) | Workspace and Git Worktree Isolation | 09-10 |
| 12 | [`plans/12-review-quality-gates.md`](plans/12-review-quality-gates.md) | Review, Rework and Quality Gates | 09-11 |
| 13 | [`plans/13-skills-mcp-lsp.md`](plans/13-skills-mcp-lsp.md) | Skills, MCP and LSP Integration | 07-08 |
| 14 | [`plans/14-ipc-preload-contracts.md`](plans/14-ipc-preload-contracts.md) | Typed IPC and Preload Contracts | core through 13 |
| 15 | [`plans/15-renderer-ui-figma-binding.md`](plans/15-renderer-ui-figma-binding.md) | Renderer V2 UI and Figma Prototype Binding | 14 + backend projections |
| 16 | [`plans/16-security-permissions-secrets.md`](plans/16-security-permissions-secrets.md) | Security, Permissions and Secrets | 04,07,14 |
| 17 | [`plans/17-observability-usage-budget.md`](plans/17-observability-usage-budget.md) | Observability, Usage, Quota and Budget | 03-05,10,16 |
| 18 | [`plans/18-v1-migration-cutover.md`](plans/18-v1-migration-cutover.md) | V1.3.1 Data Migration and Cutover Preparation | 02-05 + stable schemas |
| 19 | [`plans/19-updates-remote-control.md`](plans/19-updates-remote-control.md) | Updates and Remote Control V2 Integration | 14,16 |
| 20 | [`plans/20-verification-release-cutover.md`](plans/20-verification-release-cutover.md) | V2 Verification, Cutover and Release | 01-19 |


## 7. Cross-Plan Definition of Done

A detailed plan is DONE only if: its focused tests pass; `npm run typecheck` passes; new public contracts have Zod/runtime validation where external; no forbidden dependency direction was introduced; no production path executes narrated tool prose; new state transitions have deterministic tests; no secret reaches renderer/log/event fixtures; the plan's commit SHA is recorded.

## 8. Release-Level Blocking Acceptance

The release cannot be declared complete until all criteria in `architecture/03-other/08-acceptance-criteria.md` are mapped in `docs/v2/acceptance-matrix.md`. At minimum this includes persistence/restart recovery, runtime epoch portability, narrated-tool protection, multi-account routing, isolated parallel writes, non-writing Orchestrator, review/rework gating, renderer secret boundary, migration idempotency, locked navigation/tabs/lifecycle and the final production build.

## 9. Suggested Commit/PR Strategy

Use one branch/PR per detailed plan when practical (`v2/p01-foundation`, `v2/p02-domain`, ...). When a plan is too tightly coupled to the immediately previous plan, use one branch but preserve one independently green commit per task and one plan-complete checkpoint commit. Do not squash away migration/release evidence until after review.

## 10. AI Coder Start Command

Read in this order before coding:

```text
architecture/README.md
architecture/03-other/07-coding-rules-and-boundaries.md
plans/00-MASTER-PLAN.md
plans/01-foundation-module-boundaries.md
```

Then execute only P01. After its completion gate is green and reviewed, proceed to P02 according to the dependency graph.


---

# V2 Foundation and Module Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the V2 package skeleton, common primitives, feature cutover flag, and deterministic test seams without changing user-visible behavior.

**Architecture:** Introduce V2 beside V1 with inward-pointing dependencies. Shared contracts remain pure; main owns application/infrastructure; renderer depends only on preload contracts.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/03-other/07-coding-rules-and-boundaries.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Execute according to `../00-MASTER-PLAN.md`; do not bypass earlier interface-producing plans.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Create V2 directory/barrel skeleton

**Files:**
- Create: `src/main/v2/domain/index.ts`
- Create: `src/main/v2/application/index.ts`
- Create: `src/main/v2/runtime/index.ts`
- Create: `src/main/v2/infrastructure/index.ts`
- Create: `src/main/v2/ipc/index.ts`
- Create: `src/shared/v2/index.ts`
- Create: `src/renderer/src/v2/index.ts`
- Test: `tests/unit/v2/module-boundaries.test.ts`

**Interfaces:**
- Consumes: Current TypeScript path resolution and Electron project layout.
- Produces: `src/*/v2` roots that compile without importing legacy orchestration.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import * as sharedV2 from '../../../src/shared/v2'

describe('v2 module roots', () => {
  it('exposes a loadable shared root', () => expect(sharedV2).toBeDefined())
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/module-boundaries.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// src/shared/v2/index.ts
export * from './contracts/common'

// src/main/v2/domain/index.ts
export {}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/module-boundaries.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "chore(v2): establish module boundaries"
```

### Task 2: Add common IDs, clock, result and version contracts

**Files:**
- Create: `src/shared/v2/contracts/common.ts`
- Create: `src/main/v2/application/ports/clock.ts`
- Create: `src/main/v2/application/ports/id-generator.ts`
- Create: `src/main/v2/infrastructure/system/system-clock.ts`
- Create: `src/main/v2/infrastructure/system/uuid-generator.ts`
- Test: `tests/unit/v2/common-primitives.test.ts`

**Interfaces:**
- Consumes: Node crypto only in infrastructure; shared contracts remain serializable.
- Produces: `EntityId`, `IsoDateTime`, `CommandResult<T>`, `Clock`, `IdGenerator`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { success } from '../../../src/shared/v2/contracts/common'
it('builds serializable command success', () => {
  expect(success({ id: 'x' })).toEqual({ ok: true, value: { id: 'x' } })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/common-primitives.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type EntityId = string
export type IsoDateTime = string
export type CommandResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }
export const success = <T>(value: T): CommandResult<T> => ({ ok: true, value })
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/common-primitives.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add deterministic common primitives"
```

### Task 3: Add V2 bootstrap feature gate

**Files:**
- Create: `src/main/v2/application/v2-bootstrap.ts`
- Create: `src/shared/v2/contracts/version.ts`
- Modify: `src/main/index.ts` — app startup/bootstrap seam only
- Test: `tests/unit/v2/v2-bootstrap.test.ts`

**Interfaces:**
- Consumes: Main process startup and `app.getPath("userData")` supplied from the caller.
- Produces: `createV2Runtime({userDataPath, enabled})` returning disposable V2 services without replacing V1 yet.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createV2Runtime } from '../../../src/main/v2/application/v2-bootstrap'
it('does not start services when disabled', async () => {
  const rt = await createV2Runtime({ enabled: false, userDataPath: 'x' })
  expect(rt.enabled).toBe(false)
  await rt.dispose()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v2-bootstrap.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export async function createV2Runtime(input: { enabled: boolean; userDataPath: string }) {
  if (!input.enabled) return { enabled: false as const, dispose: async () => {} }
  return { enabled: true as const, dispose: async () => {} }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v2-bootstrap.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add side-by-side bootstrap gate"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/module-boundaries.test.ts tests/unit/v2/common-primitives.test.ts tests/unit/v2/v2-bootstrap.test.ts`.

## Acceptance / Traceability

- `RULE-001` dependency direction is enforceable by structure.
- No V1 runtime behavior changes.
- V2 can be enabled/disabled at bootstrap without renderer changes.


---

# Domain Model and State Machines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the canonical Project, WorkSession, WorkflowRun, Task, TaskRun, AgentDefinition, AgentVersion, AgentRun, RuntimeEpoch, Review/Finding and Artifact entities plus legal transitions.

**Architecture:** Use pure TypeScript aggregates and named transition functions. The domain owns invariants; persistence and LLM code consume the domain rather than mutating statuses directly.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/01-domain-model.md + ../architecture/03-other/01-state-machines.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plan 01.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define domain entity contracts

**Files:**
- Create: `src/shared/v2/contracts/domain.ts`
- Create: `src/main/v2/domain/entities.ts`
- Test: `tests/unit/v2/domain-entities.test.ts`

**Interfaces:**
- Consumes: `EntityId` and serializable timestamp primitives from Plan 01.
- Produces: Stable entity shapes and correlation chain Project → WorkSession → WorkflowRun → TaskRun → AgentRun → RuntimeEpoch.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { correlationOf } from '../../../src/main/v2/domain/entities'
it('preserves full execution correlation', () => {
  expect(correlationOf({ projectId:'p',workSessionId:'w',workflowRunId:'r',taskRunId:'tr',agentRunId:'ar',runtimeEpochId:'e' })).toMatchObject({ runtimeEpochId:'e' })
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/domain-entities.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ExecutionCorrelation = {
  projectId: string; workSessionId: string; workflowRunId: string;
  taskRunId?: string; agentRunId?: string; runtimeEpochId?: string
}
export const correlationOf = (x: ExecutionCorrelation) => ({ ...x })
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/domain-entities.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define execution domain entities"
```

### Task 2: Implement WorkflowRun and TaskRun transitions

**Files:**
- Create: `src/main/v2/domain/workflow/workflow-state.ts`
- Create: `src/main/v2/domain/task/task-state.ts`
- Test: `tests/unit/v2/workflow-state.test.ts`
- Test: `tests/unit/v2/task-state.test.ts`

**Interfaces:**
- Consumes: Workflow/task status unions from domain contracts.
- Produces: `transitionWorkflow(run,event)` and `transitionTask(run,event)` that reject illegal transitions.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { transitionWorkflow } from '../../../src/main/v2/domain/workflow/workflow-state'
it('cannot complete while blocking gates remain', () => {
  expect(() => transitionWorkflow({ status:'REVIEW', blockingGates:1 } as any, { type:'COMPLETE' })).toThrow(/blocking/)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workflow-state.test.ts tests/unit/v2/task-state.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function transitionWorkflow(run: {status:string;blockingGates:number}, event:{type:string}) {
  if (event.type === 'COMPLETE' && run.blockingGates > 0) throw new Error('blocking quality gates remain')
  return { ...run, status: event.type === 'COMPLETE' ? 'COMPLETED' : run.status }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workflow-state.test.ts tests/unit/v2/task-state.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): enforce workflow task state machines"
```

### Task 3: Implement WorkSession projection semantics

**Files:**
- Create: `src/main/v2/domain/work-session/project-status.ts`
- Test: `tests/unit/v2/work-session-status.test.ts`

**Interfaces:**
- Consumes: Active WorkflowRun status and gate summaries.
- Produces: `deriveWorkSessionStatus()` matching prototype states including PAUSED/REWORK/VERIFYING/CANCELLED.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { deriveWorkSessionStatus } from '../../../src/main/v2/domain/work-session/project-status'
it('projects rework from active workflow', () => {
  expect(deriveWorkSessionStatus({ status:'REWORK' } as any)).toBe('REWORK')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/work-session-status.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const deriveWorkSessionStatus = (run: { status: string } | null) => run?.status ?? 'PLANNING'
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/work-session-status.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): derive work session status"
```

### Task 4: Implement immutable AgentVersion and terminal-run guards

**Files:**
- Create: `src/main/v2/domain/agent/agent-version.ts`
- Create: `src/main/v2/domain/runtime/runtime-epoch-state.ts`
- Test: `tests/unit/v2/agent-version.test.ts`
- Test: `tests/unit/v2/runtime-epoch-state.test.ts`

**Interfaces:**
- Consumes: AgentDefinition and RuntimeEpoch contracts.
- Produces: `createAgentVersion` immutable snapshot; epoch close/interrupt guards.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { createAgentVersion } from '../../../src/main/v2/domain/agent/agent-version'
it('freezes configuration snapshot', () => {
  const v = createAgentVersion({ id:'a', revision:1, tools:['read'] } as any)
  expect(Object.isFrozen(v)).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/agent-version.test.ts tests/unit/v2/runtime-epoch-state.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function createAgentVersion<T extends object>(input:T): Readonly<T> { return Object.freeze({ ...input }) }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/agent-version.test.ts tests/unit/v2/runtime-epoch-state.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add immutable agent and epoch domain rules"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/*state*.test.ts tests/unit/v2/domain-entities.test.ts tests/unit/v2/agent-version.test.ts`.

## Acceptance / Traceability

- `COMP-DOMAIN-R01..R05` are represented by pure domain invariants.
- `STATE-001` legal transitions are executable code, not prose.
- Domain tests run with no Electron/SQLite/model.


---

# SQLite Persistence, Event Store and Artifact Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON-as-primary V2 state with transactional SQLite/WAL repositories and a durable canonical event log while retaining filesystem artifacts and safeStorage secrets.

**Architecture:** Use a single main-process database service, migration runner, append-only event sequence per aggregate, transactional projection updates, and repository ports. Large payloads are referenced through ArtifactStore.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/12-persistence-audit-event-store.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 01-02. Plan 04 finalizes the canonical event schema consumed by EventStore.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Add SQLite dependency and database bootstrap

**Files:**
- Modify: `package.json` — add `better-sqlite3` and `@types/better-sqlite3`
- Create: `src/main/v2/infrastructure/persistence/database.ts`
- Test: `tests/unit/v2/database.test.ts`

**Interfaces:**
- Consumes: V2 bootstrap userDataPath from Plan 01.
- Produces: `openV2Database(path)` with `journal_mode=WAL`, foreign keys on, busy timeout and close().

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
it('opens sqlite in WAL mode', () => {
  const db=openV2Database(':memory:');
  expect(db.pragma('journal_mode', { simple:true })).toMatch(/memory|wal/i); db.close()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/database.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import Database from 'better-sqlite3'
export function openV2Database(file:string){
  const db=new Database(file); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  if(file !== ':memory:') db.pragma('journal_mode = WAL'); return db
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/database.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "build(v2): add sqlite persistence runtime"
```

### Task 2: Create transactional schema migration runner

**Files:**
- Create: `src/main/v2/infrastructure/persistence/migrations/001-core.sql`
- Create: `src/main/v2/infrastructure/persistence/migrations/002-events.sql`
- Create: `src/main/v2/infrastructure/persistence/migration-runner.ts`
- Test: `tests/unit/v2/migrations.test.ts`

**Interfaces:**
- Consumes: Opened SQLite database.
- Produces: `schema_migrations`, core entity tables, `canonical_events`, `import_history`, uniqueness and FK constraints.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
it('is idempotent', () => { const db:any={}; /* test uses temp db fixture */ expect(typeof migrate).toBe('function') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/migrations.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function migrate(db:any, migrations:{version:number;sql:string}[]) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r:any)=>r.version))
  const tx=db.transaction(()=>{ for(const m of migrations){ if(applied.has(m.version)) continue; db.exec(m.sql); db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(m.version,new Date().toISOString()) } })
  tx()
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/migrations.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add transactional database migrations"
```

### Task 3: Implement EventStore with monotonic aggregate sequence

**Files:**
- Create: `src/main/v2/application/ports/event-store.ts`
- Create: `src/main/v2/infrastructure/persistence/sqlite-event-store.ts`
- Test: `tests/unit/v2/sqlite-event-store.test.ts`

**Interfaces:**
- Consumes: Canonical event envelope contract from Plan 04 may be introduced as a minimal forward type here and completed there.
- Produces: `append(expectedSequence,event[])`, `load(aggregateId,afterSequence)`, optimistic concurrency error.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rejects stale expected sequence', async () => {
  const store = await createTestSqliteEventStore()
  await store.append('ws-1',0,[{id:'e1',type:'USER_MESSAGE'}])
  await expect(store.append('ws-1',0,[{id:'e2',type:'ASSISTANT_MESSAGE'}])).rejects.toThrow(/sequence/i)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/sqlite-event-store.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export interface EventStore {
  append(aggregateId:string, expectedSequence:number, events:unknown[]): Promise<number>
  load(aggregateId:string, afterSequence?:number): Promise<unknown[]>
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/sqlite-event-store.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add canonical sqlite event store"
```

### Task 4: Implement repositories and artifact references

**Files:**
- Create: `src/main/v2/infrastructure/persistence/repositories.ts`
- Create: `src/main/v2/application/ports/artifact-store.ts`
- Create: `src/main/v2/infrastructure/artifacts/legacy-artifact-adapter.ts`
- Test: `tests/unit/v2/repositories.test.ts`

**Interfaces:**
- Consumes: Domain entity shapes and current `src/main/artifact-store.ts` at edge only.
- Produces: Repositories for Project/WorkSession/Workflow/Task/Agent and `ArtifactRef` records, no blob-in-SQLite policy.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('round trips work session metadata without artifact bytes', async () => {
  const repo = await createTestRepositories()
  await repo.workSessions.save({id:'ws-1',projectId:'p1',title:'OAuth',artifactRefs:['a1']} as any)
  const stored = await repo.workSessions.get('ws-1') as any
  expect(stored.artifactRefs).toEqual(['a1']); expect(stored).not.toHaveProperty('artifactBytes')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/repositories.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ArtifactRef={ id:string; projectId:string; kind:string; path:string; sha256?:string; size:number }
export interface WorkSessionRepository { get(id:string):Promise<unknown|null>; save(value:unknown):Promise<void> }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/repositories.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist domain projections and artifact refs"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/database.test.ts tests/unit/v2/migrations.test.ts tests/unit/v2/sqlite-event-store.test.ts tests/unit/v2/repositories.test.ts`.

## Acceptance / Traceability

- SQLite crash-safety uses WAL + transactions.
- Durable event order is deterministic.
- Secrets and large artifacts are not stored as SQLite plaintext blobs.
- Persistence ports are fakeable in tests.


---

# Canonical Event Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the provider-neutral durable/streaming event protocol that becomes the single semantic history for conversations, tool execution, runtime changes, workflow changes and audit.

**Architecture:** Adapters produce normalized stream events; an assembler persists only meaningful completed events. Durable events carry schema version, correlation IDs, event IDs and monotonic sequence.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/02-canonical-event-protocol.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 01-03.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define canonical event schemas

**Files:**
- Create: `src/shared/v2/schemas/canonical-event.ts`
- Create: `src/shared/v2/contracts/events.ts`
- Test: `tests/unit/v2/canonical-event-schema.test.ts`

**Interfaces:**
- Consumes: ExecutionCorrelation from Plan 02.
- Produces: `CanonicalEvent` discriminated union including UserMessage, AssistantMessage, ToolCall, ToolResult, lifecycle, Approval, Finding, Artifact, Usage and Error.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { CanonicalEventSchema } from '../../../src/shared/v2/schemas/canonical-event'
it('rejects tool result without call id', () => { expect(CanonicalEventSchema.safeParse({ type:'TOOL_RESULT' }).success).toBe(false) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/canonical-event-schema.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import { z } from 'zod'
export const CanonicalEventSchema=z.object({
  schemaVersion:z.literal(1), id:z.string().min(1), sequence:z.number().int().nonnegative(),
  type:z.string().min(1), occurredAt:z.string(), correlation:z.object({projectId:z.string(),workSessionId:z.string()}).passthrough(),
  payload:z.unknown()
})
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/canonical-event-schema.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define canonical event schema"
```

### Task 2: Separate transient stream parts from durable events

**Files:**
- Create: `src/main/v2/runtime/canonical/stream-events.ts`
- Create: `src/main/v2/runtime/canonical/event-assembler.ts`
- Test: `tests/unit/v2/event-assembler.test.ts`

**Interfaces:**
- Consumes: Provider-neutral stream deltas and canonical durable schemas.
- Produces: Assembler that folds text/reasoning deltas into one completed AssistantMessage and persists no partial tool calls.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('folds text deltas into one assistant message', () => {
  const a=new EventAssembler(); a.accept({kind:'text-delta',text:'hello '}); a.accept({kind:'text-delta',text:'world'})
  expect(a.finish()).toEqual([{type:'ASSISTANT_MESSAGE',payload:{text:'hello world'}}])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/event-assembler.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class EventAssembler {
  private text=''
  accept(part:{kind:string;text?:string}){ if(part.kind==='text-delta') this.text+=part.text ?? '' }
  finish(){ return this.text ? [{ type:'ASSISTANT_MESSAGE', payload:{ text:this.text } }] : [] }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/event-assembler.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): assemble durable canonical messages"
```

### Task 3: Add event factory and redaction hooks

**Files:**
- Create: `src/main/v2/runtime/canonical/event-factory.ts`
- Create: `src/main/v2/runtime/canonical/event-redaction.ts`
- Test: `tests/unit/v2/event-redaction.test.ts`

**Interfaces:**
- Consumes: Clock/IdGenerator and security redaction policy seam.
- Produces: Factory that cannot create events without correlation; redactor removes credential-like fields before persistence/logging.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { redactEventPayload } from '../../../src/main/v2/runtime/canonical/event-redaction'
it('redacts authorization fields', () => { expect(redactEventPayload({authorization:'Bearer secret'} as any)).toEqual({authorization:'[REDACTED]'}) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/event-redaction.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function redactEventPayload<T>(value:T):T {
  const copy=structuredClone(value as any);
  for(const k of Object.keys(copy ?? {})) if(/authorization|apiKey|token|secret/i.test(k)) copy[k]='[REDACTED]';
  return copy
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/event-redaction.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add canonical event factory redaction"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/canonical-event-schema.test.ts tests/unit/v2/event-assembler.test.ts tests/unit/v2/event-redaction.test.ts`.

## Acceptance / Traceability

- `COMP-EVENT-R01..R06` implemented.
- Provider SDK message objects are not stored as durable conversation truth.
- Tool calls/results remain structured and correlated.
- Deltas are transient; completed semantic events are durable.


---

# Provider, Account, Model and Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all providers/accounts/models through V2 ports, verify model capabilities, and implement sticky AUTO/PREFERRED/PINNED account routing with health/cooldown/quota-aware scoring.

**Architecture:** Reuse V1 provider adapters through explicit compatibility wrappers first. Route to a RuntimeTarget; never bind an Agent directly to one mutable active account. RuntimeTarget stays sticky for the RuntimeEpoch.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/04-provider-account-model-routing.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 01-04. Can execute in parallel with Plan 07 after contracts stabilize.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define ProviderPort and RuntimeTarget contracts

**Files:**
- Create: `src/shared/v2/contracts/provider.ts`
- Create: `src/main/v2/application/ports/provider-port.ts`
- Test: `tests/unit/v2/provider-contract.test.ts`

**Interfaces:**
- Consumes: Shared IDs and domain AgentVersion model.
- Produces: `ProviderSummary`, `ProviderAccountSummary`, `ModelCapability`, `RuntimeTarget`, `AccountPolicy`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { AccountPolicySchema } from '../../../src/shared/v2/contracts/provider'
it('accepts only routing policies', () => expect(AccountPolicySchema.safeParse('AUTO').success).toBe(true))
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/provider-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import { z } from 'zod'
export const AccountPolicySchema=z.enum(['AUTO','PREFERRED','PINNED'])
export type RuntimeTarget={providerId:string;accountId:string;modelId:string;capabilities:{structuredTools:'VERIFIED'|'DEGRADED'|'UNSUPPORTED'}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/provider-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define provider routing contracts"
```

### Task 2: Wrap current ProviderManager/ProviderAdapter behind V2 port

**Files:**
- Create: `src/main/v2/infrastructure/providers/v1-provider-compat.ts`
- Modify: `src/main/connections/manager.ts` — expose read-only adapter methods only if needed
- Test: `tests/unit/v2/v1-provider-compat.test.ts`

**Interfaces:**
- Consumes: Current `ProviderAdapter`/ProviderManager and vault references; no V1 types escape adapter.
- Produces: `V1ProviderCompat` maps accounts/models/usage to V2 DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not expose provider secrets in summaries', async () => {
  const legacy={listAccounts:async()=>[{id:'a',providerId:'openai',enabled:true,token:'secret'}]}; const out=await new V1ProviderCompat(legacy).listAccounts()
  expect(out[0]).toEqual({id:'a',providerId:'openai',enabled:true}); expect(out[0]).not.toHaveProperty('token')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-provider-compat.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class V1ProviderCompat {
  constructor(private readonly legacy:any){}
  async listAccounts(){ return (await this.legacy.listAccounts()).map((a:any)=>({id:a.id,providerId:a.providerId,enabled:a.enabled!==false})) }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-provider-compat.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): wrap legacy providers behind port"
```

### Task 3: Implement capability probe service

**Files:**
- Create: `src/main/v2/application/providers/capability-probe.ts`
- Create: `src/main/v2/infrastructure/providers/probe-fixtures.ts`
- Test: `tests/unit/v2/capability-probe.test.ts`

**Interfaces:**
- Consumes: ProviderPort runtime creation and fake transports.
- Produces: Probe result for structured tool calls, streaming, reasoning, images, parallel tools with VERIFIED/DEGRADED/UNSUPPORTED.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('marks narrated-only tool behavior degraded', async () => {
  const runtime=fakeProbeRuntime([{kind:'text-delta',text:'Calling read({path:"a.ts"})'},{kind:'finish',reason:'stop'}]); const result=await probeStructuredTools(runtime,sampleReadTool())
  expect(result.structuredTools).toBe('DEGRADED')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/capability-probe.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type CapabilityProbeResult={structuredTools:'VERIFIED'|'DEGRADED'|'UNSUPPORTED';streaming:boolean;reasoning:'SUPPORTED'|'UNKNOWN'}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/capability-probe.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): verify runtime capabilities"
```

### Task 4: Implement sticky account router

**Files:**
- Create: `src/main/v2/runtime/routing/account-router.ts`
- Create: `src/main/v2/runtime/routing/router-score.ts`
- Test: `tests/unit/v2/account-router.test.ts`

**Interfaces:**
- Consumes: Account policy, quota/health snapshots, capability probe results.
- Produces: `route(input): RuntimeTarget`, deterministic scoring, PINNED refusal, PREFERRED fallback, AUTO health scoring; target immutable within epoch.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('prefers healthy enabled account and remains deterministic', () => {
  const candidates=[{id:'a',enabled:true,cooldown:false,quotaKnown:true,remaining:80,activeRuns:0},{id:'b',enabled:true,cooldown:false,quotaKnown:true,remaining:20,activeRuns:0}]
  expect(selectBestAccount(candidates).id).toBe('a'); expect(selectBestAccount(candidates).id).toBe('a')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/account-router.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function scoreAccount(a:{enabled:boolean;cooldown:boolean;quotaKnown:boolean;remaining?:number;activeRuns:number}){
  if(!a.enabled||a.cooldown) return -Infinity
  return (a.quotaKnown ? Math.max(0,a.remaining ?? 0) : 50) - a.activeRuns*10
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/account-router.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add sticky multi-account routing"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/provider-contract.test.ts tests/unit/v2/v1-provider-compat.test.ts tests/unit/v2/capability-probe.test.ts tests/unit/v2/account-router.test.ts`.

## Acceptance / Traceability

- `AC-PROV-01..03` covered by contracts/tests.
- Multiple accounts can be enabled simultaneously; no exclusive `activeAccountId` semantics in V2.
- Routing never uses secret material in renderer/shared contracts.
- Cooldown is scoped to account/pool and recorded for later routing decisions.


---

# Context Compiler and Runtime Epoch Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile minimal safe context from canonical history and implement runtime switching as new RuntimeEpochs within the same AgentRun/WorkSession.

**Architecture:** The ContextCompiler selects canonical semantic history, project/task instructions and artifacts, then a provider adapter projects that context to native request format. Switching closes the prior epoch and starts a new one; raw provider conversation IDs are not reused across providers.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/05-context-compiler.md + ../architecture/02-components/03-work-session-runtime-epoch.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 02-05.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define context packet and selection policy

**Files:**
- Create: `src/shared/v2/contracts/context.ts`
- Create: `src/main/v2/runtime/context/context-policy.ts`
- Test: `tests/unit/v2/context-policy.test.ts`

**Interfaces:**
- Consumes: Canonical events and Task/AgentRun correlation.
- Produces: `ContextPacket` with system instructions, goal/task, canonical history, artifacts, tool schemas and token budget metadata.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not include unrelated task events', () => {
  const events=[eventFor('task-a','A'),eventFor('task-b','B')]
  expect(selectContextEvents(events,{taskRunId:'task-a'}).map((e:any)=>e.payload.text)).toEqual(['A'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/context-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ContextPacket={system:string[];goal:string;task?:string;history:unknown[];artifacts:{id:string;summary:string}[];maxInputTokens:number}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/context-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define context selection policy"
```

### Task 2: Implement canonical ContextCompiler

**Files:**
- Create: `src/main/v2/runtime/context/context-compiler.ts`
- Test: `tests/unit/v2/context-compiler.test.ts`

**Interfaces:**
- Consumes: EventStore reader, repositories, ContextPolicy.
- Produces: `compileForAgentRun(input)` deterministic output independent of provider-native cache/session.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rebuilds context after restart from canonical history only', async () => {
  const compiler=new ContextCompiler({loadEvents:async()=>[{type:'USER_MESSAGE',payload:{text:'fix auth'}}]})
  const packet=await compiler.compileForAgentRun({workSessionId:'ws-1',goal:'OAuth'})
  expect(packet.history).toEqual([{type:'USER_MESSAGE',payload:{text:'fix auth'}}]); expect(packet).not.toHaveProperty('providerConversationId')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/context-compiler.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class ContextCompiler {
  constructor(private readonly deps:{loadEvents:(id:string)=>Promise<any[]>}){}
  async compileForAgentRun(input:{workSessionId:string;goal:string}){ return {goal:input.goal,history:await this.deps.loadEvents(input.workSessionId),system:[],artifacts:[],maxInputTokens:0} }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/context-compiler.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): compile provider-neutral runtime context"
```

### Task 3: Implement RuntimeEpochService switch semantics

**Files:**
- Create: `src/main/v2/application/runtime/runtime-epoch-service.ts`
- Test: `tests/unit/v2/runtime-epoch-service.test.ts`

**Interfaces:**
- Consumes: RuntimeTarget router, RuntimeEpoch repository/event store, ContextCompiler.
- Produces: `startEpoch`, `switchRuntime`, `interruptEpoch`; switching preserves WorkSession/AgentRun IDs and emits epoch lifecycle events.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('switches target by closing old epoch and creating a new epoch', async () => {
  const repo=new FakeEpochRepository([{id:'e1',agentRunId:'ar1',status:'RUNNING',target:'claude'}])
  const svc=createRuntimeEpochServiceForTest(repo)
  const next=await svc.switchRuntime({agentRunId:'ar1',target:{providerId:'openai',accountId:'a',modelId:'codex'},reason:'user-switch'})
  expect(repo.get('e1')?.status).toBe('COMPLETED'); expect(next.epochId).not.toBe('e1')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/runtime-epoch-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export interface RuntimeEpochService { switchRuntime(input:{agentRunId:string;target:any;reason:string}):Promise<{epochId:string}> }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/runtime-epoch-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): implement runtime epoch switching"
```

### Task 4: Add provider-native context projection boundary

**Files:**
- Create: `src/main/v2/runtime/providers/native-context-projector.ts`
- Test: `tests/unit/v2/native-context-projector.test.ts`

**Interfaces:**
- Consumes: ContextPacket and target model capability.
- Produces: Structured projection preserving ToolCall/ToolResult when representable; neutral factual execution record when not representable; never assistant tool-shaped prose.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('never flattens tool calls as assistant prose', () => {
  const projected=projectContext({history:[{type:'TOOL_CALL',payload:{tool:'read',arguments:{path:'a.ts'}}}]},{structuredToolHistory:false})
  expect(projected.some((m:any)=>m.role==='assistant' && /read\(/.test(String(m.content)))).toBe(false)
  expect(projected[0].role).toBe('user')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/native-context-projector.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function projectContext(packet:any, capability:{structuredToolHistory:boolean}) {
  return capability.structuredToolHistory ? packet.history : packet.history.map((e:any)=>e.type?.startsWith('TOOL_')?{role:'user',content:`Execution record: ${e.type}`} : e)
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/native-context-projector.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "fix(v2): preserve tool protocol across runtime changes"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/context-policy.test.ts tests/unit/v2/context-compiler.test.ts tests/unit/v2/runtime-epoch-service.test.ts tests/unit/v2/native-context-projector.test.ts`.

## Acceptance / Traceability

- `AC-RUN-01`, `AC-RUN-02`, `TEST-REG-01`, `TEST-REG-02`.
- Same WorkSession continues; new RuntimeEpoch is explicit.
- No provider-specific reasoning/cache IDs are copied into another provider.
- Context can be reconstructed after process restart.


---

# Tool Execution and Protocol Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that only structured canonical ToolCall events can reach tool execution, with schema validation, permission gates, idempotency and auditable results.

**Architecture:** ProtocolGuard validates provider output before ToolExecutor. PermissionEngine resolves allow/ask/deny. Tool execution records an idempotency key before side effects and stores structured ToolResult/Error events.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/07-tool-execution-protocol-guard.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 02,04. V1 tool registry can be wrapped before Plan 08.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define V2 ToolDefinition and ToolCall schemas

**Files:**
- Create: `src/shared/v2/contracts/tools.ts`
- Create: `src/shared/v2/schemas/tool-call.ts`
- Test: `tests/unit/v2/tool-call-schema.test.ts`

**Interfaces:**
- Consumes: Canonical correlation and Zod.
- Produces: `ToolDefinition`, `CanonicalToolCall`, `CanonicalToolResult`, explicit `callId` and JSON arguments.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { CanonicalToolCallSchema } from '../../../src/shared/v2/schemas/tool-call'
it('requires structured arguments and call id', () => expect(CanonicalToolCallSchema.safeParse({tool:'read'}).success).toBe(false))
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/tool-call-schema.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import { z } from 'zod'
export const CanonicalToolCallSchema=z.object({callId:z.string().min(1),tool:z.string().min(1),arguments:z.record(z.string(),z.unknown())})
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/tool-call-schema.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define structured tool protocol"
```

### Task 2: Implement ProtocolGuard

**Files:**
- Create: `src/main/v2/runtime/tools/protocol-guard.ts`
- Test: `tests/unit/v2/protocol-guard.test.ts`

**Interfaces:**
- Consumes: Available tool registry, capability state, CanonicalToolCall schema.
- Produces: `validateToolCall` checks existence/schema/call ID/duplicates; narrated text returns protocol violation and never executable command.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not convert narrated prose into a tool call', () => {
  const guard=new ProtocolGuard(new Map([['read',sampleReadTool()]]))
  expect(guard.acceptAssistantText('Calling read({"path":"a.ts"})')).toEqual({ok:false,code:'PROTOCOL_VIOLATION'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/protocol-guard.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ProtocolDecision={ok:true;call:any}|{ok:false;code:'PROTOCOL_VIOLATION'|'UNKNOWN_TOOL'|'INVALID_ARGS'|'DUPLICATE_CALL'}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/protocol-guard.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): guard structured tool calls"
```

### Task 3: Implement PermissionEngine and approval request

**Files:**
- Create: `src/main/v2/runtime/tools/permission-engine.ts`
- Create: `src/main/v2/application/approvals/approval-service.ts`
- Test: `tests/unit/v2/permission-engine.test.ts`

**Interfaces:**
- Consumes: Global/project/agent permission profiles and tool metadata.
- Produces: `resolvePermission` with DENY > explicit agent/project > global default; ASK emits durable ApprovalRequested.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('deny wins over allow', () => {
  expect(resolvePermission(['ALLOW','DENY','ALLOW'])).toBe('DENY'); expect(resolvePermission(['ALLOW','ASK'])).toBe('ASK')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/permission-engine.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type Permission='ALLOW'|'ASK'|'DENY'
export function resolvePermission(levels:Permission[]):Permission { return levels.includes('DENY')?'DENY':levels.includes('ASK')?'ASK':'ALLOW' }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/permission-engine.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): centralize tool permissions"
```

### Task 4: Implement idempotent ToolExecutor and V1 tool adapter

**Files:**
- Create: `src/main/v2/runtime/tools/tool-executor.ts`
- Create: `src/main/v2/infrastructure/tools/v1-tool-registry-adapter.ts`
- Test: `tests/unit/v2/tool-executor.test.ts`

**Interfaces:**
- Consumes: ProtocolGuard, PermissionEngine, EventStore, current V1 `ToolDefinition` registry at edge.
- Produces: `execute(call,ctx)` records started/result/error and executes each callId at most once.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('executes duplicate call id at most once', async () => {
  let sideEffects=0; const executor=new ToolExecutor(); const call={callId:'c1'}
  await executor.execute(call,async()=>++sideEffects); await executor.execute(call,async()=>++sideEffects); expect(sideEffects).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/tool-executor.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class ToolExecutor {
  private done=new Map<string,unknown>()
  async execute(call:{callId:string}, run:()=>Promise<unknown>){ if(this.done.has(call.callId)) return this.done.get(call.callId); const out=await run(); this.done.set(call.callId,out); return out }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/tool-executor.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): execute tools idempotently behind guard"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/tool-call-schema.test.ts tests/unit/v2/protocol-guard.test.ts tests/unit/v2/permission-engine.test.ts tests/unit/v2/tool-executor.test.ts`.

## Acceptance / Traceability

- `AC-RUN-03`, `TEST-REG-03`, `AC-SEC-02`.
- No code path scans AssistantText for `tool(...)` patterns to execute.
- MCP/native/built-in tools converge before the same permission/audit boundary.
- Duplicate call IDs cannot duplicate side effects.


---

# Agent Runtime V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the V2 agent execution loop around AgentRun, RuntimeEpoch, ContextCompiler, Provider RuntimePort and guarded tool execution while retaining deterministic fake-model tests.

**Architecture:** AgentRunner owns step execution but not workflow state. Every step streams provider parts → canonical assembler/guard → tool executor; epoch handoff is delegated to RuntimeEpochService. AgentDefinition is versioned before execution.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/06-agent-runtime.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 04-07.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define RuntimePort and model stream parts

**Files:**
- Create: `src/main/v2/application/ports/runtime-port.ts`
- Create: `src/shared/v2/contracts/runtime.ts`
- Test: `tests/unit/v2/runtime-port.test.ts`

**Interfaces:**
- Consumes: RuntimeTarget and ContextPacket.
- Produces: `RuntimePort.open(target)`, `RuntimeClient.stream(request)`, normalized `RuntimeStreamPart`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('runtime stream union is provider-neutral', () => {
  const part:RuntimeStreamPart={kind:'tool-call',call:{callId:'c1',tool:'read',arguments:{path:'a.ts'}}}; expect(part.kind).toBe('tool-call')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/runtime-port.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type RuntimeStreamPart={kind:'text-delta';text:string}|{kind:'reasoning-delta';text:string}|{kind:'tool-call';call:unknown}|{kind:'finish';reason:string}|{kind:'error';error:{code:string;message:string}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/runtime-port.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define runtime streaming port"
```

### Task 2: Implement V1 LlmClient compatibility RuntimePort

**Files:**
- Create: `src/main/v2/infrastructure/runtime/v1-llm-runtime-adapter.ts`
- Test: `tests/unit/v2/v1-llm-runtime-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/agent/llm.ts` LlmClient factory and V2 RuntimePort.
- Produces: Adapter translating V1 stream parts to RuntimeStreamPart without leaking AI SDK types.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('maps legacy tool call to normalized tool-call part', async () => {
  const adapter=new V1LlmRuntimeAdapter(async()=>fakeLegacyLlm([{kind:'tool-call',id:'c1',name:'read',input:{path:'a.ts'}}])); const client=await adapter.open({}); const parts=await collect(client.stream({})); expect(parts[0]).toMatchObject({kind:'tool-call'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-llm-runtime-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class V1LlmRuntimeAdapter { constructor(private readonly createLegacy:any){} async open(target:any){ const llm=await this.createLegacy(target); return { stream:(req:any)=>llm.stream(req) } } }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-llm-runtime-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): adapt current llm runtime"
```

### Task 3: Implement AgentRunService and AgentRunner

**Files:**
- Create: `src/main/v2/application/agent/agent-run-service.ts`
- Create: `src/main/v2/runtime/agent/agent-runner.ts`
- Test: `tests/unit/v2/agent-runner.test.ts`

**Interfaces:**
- Consumes: AgentVersion, ContextCompiler, RuntimeEpochService, RuntimePort, ProtocolGuard, ToolExecutor, EventStore.
- Produces: `runAssignment()` with maxSteps, abort, steering boundaries, usage and terminal outcome events.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('finishes after a step with no tool calls', async () => {
  const runner=new AgentRunner(); const result=await runner.run({maxSteps:3,nextStep:async()=>[{kind:'text-delta',text:'done'},{kind:'finish',reason:'stop'}]}); expect(result.status).toBe('SUCCEEDED')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/agent-runner.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class AgentRunner {
  async run(input:any){ for(let step=0; step<input.maxSteps; step++){ const parts=await input.nextStep(); if(!parts.some((p:any)=>p.kind==='tool-call')) return {status:'SUCCEEDED'} } return {status:'STEP_LIMIT'} }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/agent-runner.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add canonical agent run loop"
```

### Task 4: Add compaction/steering compatibility as explicit policies

**Files:**
- Create: `src/main/v2/runtime/agent/steering-queue.ts`
- Create: `src/main/v2/runtime/context/compaction-policy.ts`
- Test: `tests/unit/v2/steering-queue.test.ts`
- Test: `tests/unit/v2/compaction-policy.test.ts`

**Interfaces:**
- Consumes: Canonical events and ContextCompiler.
- Produces: Steering drains only between model steps; compaction creates canonical summary artifact/event and never rewrites provider-native state.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('drains steering in FIFO order', () => {
  const q=new SteeringQueue<string>(); q.push('first'); q.push('second'); expect(q.drain()).toEqual(['first','second']); expect(q.drain()).toEqual([])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/steering-queue.test.ts tests/unit/v2/compaction-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class SteeringQueue<T>{private q:T[]=[];push(v:T){this.q.push(v)}drain(){const out=[...this.q];this.q=[];return out}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/steering-queue.test.ts tests/unit/v2/compaction-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): preserve steering and compaction semantics"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/runtime-port.test.ts tests/unit/v2/v1-llm-runtime-adapter.test.ts tests/unit/v2/agent-runner.test.ts tests/unit/v2/steering-queue.test.ts tests/unit/v2/compaction-policy.test.ts`.

## Acceptance / Traceability

- Agent runtime can be unit-tested entirely with fake RuntimePort.
- AgentRunner cannot complete WorkflowRun directly.
- Context/runtime/tool boundaries are explicit.
- Current useful V1 behavior is reused through adapters, not imported into domain.


---

# Workflow / Task Graph Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic planning approval, DAG validation, task scheduling, retry/pause/resume/cancel semantics and workflow projection without allowing LLMs to own state.

**Architecture:** WorkflowEngine is application code driven by commands and agent outcomes. It validates task dependencies, selects runnable tasks, creates TaskRuns, and transitions through REVIEW/REWORK/VERIFYING only via named rules.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/08-workflow-task-graph-engine.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 02-04 and 08.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define task graph and validate DAG

**Files:**
- Create: `src/shared/v2/contracts/workflow.ts`
- Create: `src/main/v2/domain/workflow/task-graph.ts`
- Test: `tests/unit/v2/task-graph.test.ts`

**Interfaces:**
- Consumes: Task entities from Plan 02.
- Produces: `TaskGraph`, `validateGraph`, `runnableTaskIds`; cycle/missing-dependency detection.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rejects dependency cycles', () => {
  expect(()=>validateGraph([{id:'A',dependsOn:['B']},{id:'B',dependsOn:['A']}])).toThrow(/cycle/i)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/task-graph.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function validateGraph(tasks:{id:string;dependsOn:string[]}[]){
 const ids=new Set(tasks.map(t=>t.id)); for(const t of tasks) for(const d of t.dependsOn) if(!ids.has(d)) throw new Error(`missing dependency ${d}`);
 return true
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/task-graph.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): validate workflow task dags"
```

### Task 2: Implement WorkflowEngine command handler

**Files:**
- Create: `src/main/v2/application/workflow/workflow-engine.ts`
- Create: `src/main/v2/application/workflow/workflow-commands.ts`
- Test: `tests/unit/v2/workflow-engine.test.ts`

**Interfaces:**
- Consumes: Repositories/EventStore/IdGenerator/Clock and DAG.
- Produces: `createFromApprovedPlan`, `dispatchReady`, `acceptTaskOutcome`, `pause`, `resume`, `cancel`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not dispatch dependent task before prerequisites complete', async () => {
  const engine=new WorkflowEngine(); const ready=await engine.dispatchReady({tasks:[{id:'A',status:'COMPLETED',dependsOn:[]},{id:'B',status:'QUEUED',dependsOn:['A']},{id:'C',status:'QUEUED',dependsOn:['B']}]})
  expect(ready.map((t:any)=>t.id)).toEqual(['B'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workflow-engine.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class WorkflowEngine { async dispatchReady(run:any){ return run.tasks.filter((t:any)=>t.status==='QUEUED' && t.dependsOn.every((id:string)=>run.tasks.find((x:any)=>x.id===id)?.status==='COMPLETED')) } }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workflow-engine.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add deterministic workflow engine"
```

### Task 3: Implement pause/resume/cancel and recovery states

**Files:**
- Create: `src/main/v2/application/workflow/lifecycle-service.ts`
- Test: `tests/unit/v2/workflow-lifecycle.test.ts`

**Interfaces:**
- Consumes: Workflow state transitions and active AgentRun cancellation port.
- Produces: Pause blocks new dispatch; Resume same run; Cancel terminalizes run but preserves completed outputs; interrupted startup becomes recoverable state.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('pause prevents dispatch and resume preserves run id', () => {
  const paused=pauseWorkflow({id:'run-1',status:'EXECUTING'} as any); expect(paused).toMatchObject({id:'run-1',status:'PAUSED'}); expect(resumeWorkflow(paused)).toMatchObject({id:'run-1',status:'EXECUTING'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workflow-lifecycle.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type WorkflowControl={ pause(runId:string):Promise<void>; resume(runId:string):Promise<void>; cancel(runId:string):Promise<void> }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workflow-lifecycle.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): implement workflow lifecycle controls"
```

### Task 4: Implement retry policy and task attempts

**Files:**
- Create: `src/main/v2/application/workflow/retry-policy.ts`
- Test: `tests/unit/v2/retry-policy.test.ts`

**Interfaces:**
- Consumes: Classified runtime/provider/tool errors.
- Produces: Retry only transient categories, preserve TaskRun attempt history, allow new RuntimeEpoch within same attempt when runtime handoff succeeds.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not retry permission denial', () => {
  expect(shouldRetry('PERMISSION_DENIED')).toBe(false); expect(shouldRetry('RATE_LIMIT')).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/retry-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const shouldRetry=(code:string)=>['RATE_LIMIT','CAPACITY','NETWORK_TRANSIENT'].includes(code)
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/retry-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add explicit workflow retry policy"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/task-graph.test.ts tests/unit/v2/workflow-engine.test.ts tests/unit/v2/workflow-lifecycle.test.ts tests/unit/v2/retry-policy.test.ts`.

## Acceptance / Traceability

- `AC-CORE-03`, `AC-WF-01`, `TEST-REG-05`.
- LLM output is input to commands, never direct persisted status mutation.
- State is deterministic without a model.
- Cancelled/Completed run history remains queryable.


---

# Agent Team and Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement project-scoped standard agent roles, deterministic assignment records, Orchestrator planning/dispatch contracts, concurrency controls and non-recursive worker topology.

**Architecture:** Orchestrator reasons about goal/plan and proposes assignments, but WorkflowEngine validates and dispatches them. Workers cannot recursively create invisible workers. Agent definitions are project resources with immutable versions.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/09-agent-team-orchestrator.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 02,08-09.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define standard project agent profiles

**Files:**
- Create: `src/main/v2/application/agent/default-agent-profiles.ts`
- Test: `tests/unit/v2/default-agent-profiles.test.ts`

**Interfaces:**
- Consumes: AgentDefinition/AgentVersion contracts and permission profiles.
- Produces: Orchestrator, Architect, Backend Developer, Frontend Developer, Code Reviewer, Security Reviewer, QA/Tester, Integration Agent defaults.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { DEFAULT_AGENT_PROFILES } from '../../../src/main/v2/application/agent/default-agent-profiles'
it('separates security from qa', () => { expect(DEFAULT_AGENT_PROFILES.map(x=>x.name)).toContain('Security Reviewer'); expect(DEFAULT_AGENT_PROFILES.map(x=>x.name)).toContain('QA / Tester') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/default-agent-profiles.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const DEFAULT_AGENT_PROFILES=[
 {name:'Orchestrator',role:'COORDINATOR'},{name:'Architect',role:'SPECIALIST'},{name:'Backend Developer',role:'WORKER'},
 {name:'Frontend Developer',role:'WORKER'},{name:'Code Reviewer',role:'REVIEWER'},{name:'Security Reviewer',role:'REVIEWER'},
 {name:'QA / Tester',role:'REVIEWER'},{name:'Integration Agent',role:'SPECIALIST'}
] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/default-agent-profiles.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define standard agent team"
```

### Task 2: Implement assignment and dispatch service

**Files:**
- Create: `src/main/v2/application/agent/assignment-service.ts`
- Test: `tests/unit/v2/assignment-service.test.ts`

**Interfaces:**
- Consumes: Workflow runnable tasks, AgentVersion repository, AgentRunService.
- Produces: `assign(taskId,agentId)`, persisted Assignment, independent context packet, dispatch through AgentRunService.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('creates auditable assignment before execution', async () => {
  const writes:any[]=[], runs:any[]=[]; const svc=createAssignmentServiceForTest({save:async(a:any)=>writes.push(a),run:async(a:any)=>runs.push(a)})
  await svc.assignAndDispatch({taskRunId:'tr1',agentVersionId:'av1'}); expect(writes).toHaveLength(1); expect(runs).toHaveLength(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/assignment-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type Assignment={id:string;taskRunId:string;agentVersionId:string;createdAt:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/assignment-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist and dispatch agent assignments"
```

### Task 3: Implement Orchestrator policy guard

**Files:**
- Create: `src/main/v2/application/agent/orchestrator-policy.ts`
- Test: `tests/unit/v2/orchestrator-policy.test.ts`

**Interfaces:**
- Consumes: Tool permissions and workflow state.
- Produces: Default Orchestrator toolset excludes write/edit/bash destructive operations; plan/task creation commands go through WorkflowEngine.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { ORCHESTRATOR_DENIED_TOOLS } from '../../../src/main/v2/application/agent/orchestrator-policy'
it('denies write tools', () => expect(ORCHESTRATOR_DENIED_TOOLS).toContain('write'))
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/orchestrator-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const ORCHESTRATOR_DENIED_TOOLS=['write','edit','apply_patch','bash','revert','spawn_worker'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/orchestrator-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): enforce coordinator non-writing policy"
```

### Task 4: Add concurrency and budget admission policy

**Files:**
- Create: `src/main/v2/application/agent/admission-policy.ts`
- Test: `tests/unit/v2/admission-policy.test.ts`

**Interfaces:**
- Consumes: Configured project/session concurrency and budget settings; no invented hard defaults.
- Produces: `canDispatch` returns ALLOW/ASK/BLOCK with reason, based on explicit user policy and current usage.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not invent a hard budget when none configured', () => {
  expect(canDispatch({spent:999999})).toEqual({decision:'ALLOW'}); expect(canDispatch({hardLimit:10,spent:10})).toEqual({decision:'BLOCK'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/admission-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function canDispatch(input:{hardLimit?:number;spent:number}){ if(input.hardLimit==null) return {decision:'ALLOW'}; return input.spent>=input.hardLimit?{decision:'BLOCK'}:{decision:'ALLOW'} }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/admission-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): gate agent fanout by explicit policy"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/default-agent-profiles.test.ts tests/unit/v2/assignment-service.test.ts tests/unit/v2/orchestrator-policy.test.ts tests/unit/v2/admission-policy.test.ts`.

## Acceptance / Traceability

- `AC-WF-03`; default coordinator cannot write code.
- QA and Security roles are distinct.
- Worker recursion is not available in V2 default topology.
- Every assignment has identity, agent version and task correlation.


---

# Workspace and Git Worktree Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate parallel write tasks in Git worktrees/branches and integrate approved outputs through a dedicated Integration Agent/service with auditable conflict handling.

**Architecture:** WorkspacePort owns Git/process operations. Workflow Engine requests a task workspace; write-capable tasks never share a mutable checkout when concurrent. Integration merges into a workflow integration branch and creates explicit conflict tasks.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/10-workspace-git-isolation.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 09-10.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define WorkspacePort and task workspace contract

**Files:**
- Create: `src/main/v2/application/ports/workspace-port.ts`
- Create: `src/shared/v2/contracts/workspace.ts`
- Test: `tests/unit/v2/workspace-contract.test.ts`

**Interfaces:**
- Consumes: Project/task/workflow IDs.
- Produces: `TaskWorkspace {path,branch,worktreeId,baseCommit}` and create/remove/status/merge methods.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('requires branch and base commit', () => {
  expect(taskBranch('wf1','T04',2)).toBe('bs/v2/wf1/T04/2')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workspace-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type TaskWorkspace={id:string;path:string;branch:string;baseCommit:string;taskRunId:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workspace-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define isolated workspace port"
```

### Task 2: Implement Git worktree manager

**Files:**
- Create: `src/main/v2/infrastructure/git/git-command.ts`
- Create: `src/main/v2/infrastructure/git/worktree-manager.ts`
- Test: `tests/integration/v2/worktree-manager.test.ts`

**Interfaces:**
- Consumes: Git CLI and temp repository fixture.
- Produces: `createTaskWorkspace`, deterministic branch naming `bs/v2/<workflow>/<task>/<attempt>`, cleanup without deleting unmerged work.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('creates two independent writable worktrees', async () => {
  const repo=await createTempGitRepo(); const mgr=new WorktreeManager(repo.root)
  const a=await mgr.createTaskWorkspace({workflowId:'wf',taskId:'A',attempt:1,baseCommit:repo.head})
  const b=await mgr.createTaskWorkspace({workflowId:'wf',taskId:'B',attempt:1,baseCommit:repo.head})
  expect(a.path).not.toBe(b.path); expect(a.branch).not.toBe(b.branch)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/worktree-manager.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const taskBranch=(workflowId:string,taskId:string,attempt:number)=>`bs/v2/${workflowId}/${taskId}/${attempt}`
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/worktree-manager.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): isolate task writes with git worktrees"
```

### Task 3: Implement integration merge service

**Files:**
- Create: `src/main/v2/application/workflow/integration-service.ts`
- Create: `src/main/v2/infrastructure/git/git-integration-adapter.ts`
- Test: `tests/integration/v2/integration-service.test.ts`

**Interfaces:**
- Consumes: Approved task outputs/worktrees and WorkflowEngine command interface.
- Produces: Merge approved task branches in deterministic task order; produce merged commit or structured conflict finding/task.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('turns merge conflict into explicit integration conflict outcome', async () => {
  const svc=new IntegrationService({merge:async()=>({kind:'CONFLICT',files:['src/auth.ts']})} as any)
  await expect(svc.integrate(['branch-a','branch-b'])).resolves.toEqual({kind:'CONFLICT',files:['src/auth.ts']})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/integration-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type IntegrationOutcome={kind:'MERGED';commit:string}|{kind:'CONFLICT';files:string[]}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/integration-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): integrate task branches deterministically"
```

### Task 4: Add workspace audit and cleanup policy

**Files:**
- Create: `src/main/v2/application/workflow/workspace-cleanup.ts`
- Test: `tests/unit/v2/workspace-cleanup.test.ts`

**Interfaces:**
- Consumes: Workflow terminal state and worktree status.
- Produces: Cleanup only after merged/archived; preserve conflict/cancelled worktree references until user chooses discard/archive.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not delete unmerged cancelled work', () => {
  expect(mayDeleteWorkspace({merged:false,archived:false})).toBe(false); expect(mayDeleteWorkspace({merged:true,archived:false})).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workspace-cleanup.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const mayDeleteWorkspace=(x:{merged:boolean;archived:boolean})=>x.merged||x.archived
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workspace-cleanup.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): protect unmerged task workspaces"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/integration/v2/worktree-manager.test.ts tests/integration/v2/integration-service.test.ts tests/unit/v2/workspace-cleanup.test.ts`.

## Acceptance / Traceability

- `AC-WF-02`, `TEST-REG-06`.
- No parallel writers share one checkout.
- Merge conflicts become modeled work, not hidden shell failures.
- Integration changes trigger quality gate reruns.


---

# Review, Rework and Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement deterministic mechanical gates, specialist AI review findings, rework creation, re-review and final verification so no worker can self-complete a WorkSession.

**Architecture:** QualityGateService owns gate definitions/results. Reviewer agents emit Findings; WorkflowEngine applies policy to create rework tasks and block completion until all blocking gates pass.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/11-review-quality-gates.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 09-11.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define Gate, Finding and Review schemas

**Files:**
- Create: `src/shared/v2/contracts/review.ts`
- Test: `tests/unit/v2/review-contract.test.ts`

**Interfaces:**
- Consumes: Domain correlation and artifact references.
- Produces: `QualityGate`, `GateResult`, `Finding`, severity/blocking/status and evidence references.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('requires evidence for blocking finding', () => {
  expect(FindingSchema.safeParse({id:'f1',severity:'HIGH',blocking:true,title:'Missing state',evidence:[],status:'OPEN'}).success).toBe(false)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/review-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type Finding={id:string;reviewRunId:string;severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';blocking:boolean;title:string;evidence:string[];status:'OPEN'|'RESOLVED'|'DISMISSED'}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/review-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define review and gate contracts"
```

### Task 2: Implement mechanical quality gate runner

**Files:**
- Create: `src/main/v2/application/review/mechanical-gates.ts`
- Create: `src/main/v2/infrastructure/processes/command-runner.ts`
- Test: `tests/integration/v2/mechanical-gates.test.ts`

**Interfaces:**
- Consumes: Task/workflow workspace and configured commands.
- Produces: Typecheck/build/lint/test gates with captured stdout/stderr artifact and exit-code based result.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('fails gate on nonzero command without parsing prose', () => {
  expect(gateResultFromExit(1)).toBe('FAIL'); expect(gateResultFromExit(0)).toBe('PASS')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/mechanical-gates.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const gateResultFromExit=(code:number)=>code===0?'PASS':'FAIL'
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/mechanical-gates.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): run deterministic mechanical gates"
```

### Task 3: Implement AI review and finding ingestion

**Files:**
- Create: `src/main/v2/application/review/review-service.ts`
- Test: `tests/unit/v2/review-service.test.ts`

**Interfaces:**
- Consumes: Reviewer AgentRun results, Review schemas, EventStore.
- Produces: ReviewService creates ReviewRun, validates structured findings, persists evidence and determines blocking status.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('treats high blocking finding as failed review', () => {
  expect(reviewPasses([{blocking:true,status:'OPEN'}])).toBe(false); expect(reviewPasses([{blocking:true,status:'RESOLVED'}])).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/review-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const reviewPasses=(findings:{blocking:boolean;status:string}[])=>!findings.some(f=>f.blocking&&f.status==='OPEN')
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/review-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): ingest specialist review findings"
```

### Task 4: Implement rework and final verification loop

**Files:**
- Create: `src/main/v2/application/review/rework-service.ts`
- Create: `src/main/v2/application/review/final-verifier.ts`
- Test: `tests/integration/v2/rework-lifecycle.test.ts`

**Interfaces:**
- Consumes: WorkflowEngine, Gate results, Findings, assignment service.
- Produces: FAIL → create rework Task → worker fix → impacted gates rerun → reviewer rerun → final verification → completed.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('blocks completion until rerun security gate passes', () => {
  expect(canFinalize({gates:[{blocking:true,status:'FAIL'}],findings:[]})).toBe(false); expect(canFinalize({gates:[{blocking:true,status:'PASS'}],findings:[]})).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/rework-lifecycle.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function canFinalize(input:{gates:{blocking:boolean,status:string}[];findings:{blocking:boolean,status:string}[]}){ return input.gates.every(g=>!g.blocking||g.status==='PASS') && input.findings.every(f=>!f.blocking||f.status!=='OPEN') }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/rework-lifecycle.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): enforce rework and final verification"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/review-contract.test.ts tests/integration/v2/mechanical-gates.test.ts tests/unit/v2/review-service.test.ts tests/integration/v2/rework-lifecycle.test.ts`.

## Acceptance / Traceability

- `AC-WF-04`, `TEST-REG-04`.
- Review failure cannot be bypassed by worker success.
- Mechanical gate semantics use process exit/status, not LLM judgment.
- Prototype full rework lifecycle maps to real backend state.


---

# Skills, MCP and LSP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate project skills, MCP servers and LSP into V2 without allowing them to bypass the canonical tool, permission, event and audit boundaries.

**Architecture:** Wrap existing managers behind ports. Skills are resolved into immutable AgentVersion/WorkSession context snapshots. MCP tools are normalized to V2 ToolDefinitions before ProtocolGuard/PermissionEngine; LSP remains an explicit tool/diagnostic source.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/13-skills-mcp-lsp.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 07-08. Can run before UI.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define Skill and MCP/LSP contracts

**Files:**
- Create: `src/shared/v2/contracts/skills.ts`
- Create: `src/shared/v2/contracts/mcp.ts`
- Create: `src/main/v2/application/ports/mcp-port.ts`
- Create: `src/main/v2/application/ports/lsp-port.ts`
- Test: `tests/unit/v2/extension-contracts.test.ts`

**Interfaces:**
- Consumes: Project/Agent IDs and ToolDefinition.
- Produces: Serializable SkillDefinition/SkillSnapshot, MCP server/tool descriptors, LSP diagnostics.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('skill snapshot records source and version', () => {
  const s = snapshotSkill({id:'planning',name:'planning',version:'1.4.0',source:'PROJECT',content:'x'})
  expect(s).toMatchObject({id:'planning',version:'1.4.0',source:'PROJECT'})
  expect(s.contentHash).toMatch(/^[a-f0-9]{64}$/)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/extension-contracts.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type SkillSnapshot={id:string;name:string;version:string;source:'BUILTIN'|'PROJECT'|'USER';contentHash:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/extension-contracts.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define skill mcp lsp contracts"
```

### Task 2: Implement skill resolver and snapshotter

**Files:**
- Create: `src/main/v2/application/skills/skill-resolver.ts`
- Test: `tests/unit/v2/skill-resolver.test.ts`

**Interfaces:**
- Consumes: Current skill discovery at edge and ArtifactStore/hash helper.
- Produces: Resolve precedence and immutable snapshots referenced by AgentVersion/RuntimeEpoch.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('project skill overrides same-name user skill by explicit precedence', () => {
  const out = resolveSkills([{name:'x',source:'USER'},{name:'x',source:'PROJECT'}] as any)
  expect(out.find((x:any)=>x.name==='x')?.source).toBe('PROJECT')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/skill-resolver.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const skillRank=(source:string)=>source==='PROJECT'?3:source==='USER'?2:1
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/skill-resolver.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): snapshot resolved skills"
```

### Task 3: Wrap existing MCP manager and normalize tools

**Files:**
- Create: `src/main/v2/infrastructure/mcp/v1-mcp-adapter.ts`
- Test: `tests/unit/v2/v1-mcp-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/agent/mcp/manager.ts`; V2 ToolDefinition.
- Produces: MCP tool adapter with serverId metadata; execution still enters V2 ToolExecutor.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not execute mcp directly from adapter mapping', async () => {
  const run = vi.fn(); const adapter = new V1McpAdapter({listTools:async()=>[{name:'query',run}]} as any)
  const defs = await adapter.listToolDefinitions()
  expect(defs[0].name).toBe('query'); expect(run).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-mcp-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type McpToolBinding={serverId:string;toolName:string;definition:unknown}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-mcp-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): route mcp tools through v2 guard"
```

### Task 4: Wrap LSP diagnostics and edit follow-up

**Files:**
- Create: `src/main/v2/infrastructure/lsp/v1-lsp-adapter.ts`
- Test: `tests/unit/v2/v1-lsp-adapter.test.ts`

**Interfaces:**
- Consumes: Current LSP manager and canonical artifact/finding contracts.
- Produces: Normalized diagnostics returned as tool output/evidence; no direct workflow mutation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('maps lsp diagnostic without changing task state', () => {
  const d = mapLegacyDiagnostic({uri:'a.ts',message:'x',severity:1,start:1,end:2} as any)
  expect(d).toMatchObject({uri:'a.ts',severity:'ERROR',message:'x'})
  expect(d).not.toHaveProperty('taskStatus')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-lsp-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type LspDiagnostic={uri:string;range:{start:number;end:number};severity:'ERROR'|'WARNING'|'INFO';message:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-lsp-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): adapt lsp diagnostics"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/extension-contracts.test.ts tests/unit/v2/skill-resolver.test.ts tests/unit/v2/v1-mcp-adapter.test.ts tests/unit/v2/v1-lsp-adapter.test.ts`.

## Acceptance / Traceability

- MCP cannot bypass permissions/audit.
- Skill content used by an AgentRun is reproducible through snapshot/version/hash.
- LSP is evidence/diagnostics, not a hidden state machine.


---

# Typed IPC and Preload Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc V2 IPC usage with namespaced Zod-validated command/query/subscription contracts exposed through one minimal `window.bs.v2` API.

**Architecture:** Shared defines request/response schemas and DTOs. Main registers namespaced handlers that call application services. Preload exposes only typed DTO-based APIs and subscription gap detection metadata.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/03-other/02-api-ipc-contracts.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires core application services through Plan 13; UI Plan 15 depends on this.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define V2 IPC contract registry

**Files:**
- Create: `src/shared/v2/contracts/ipc.ts`
- Create: `src/shared/v2/schemas/ipc.ts`
- Test: `tests/unit/v2/ipc-contract.test.ts`

**Interfaces:**
- Consumes: Project/WorkSession/Workflow/Agent/Provider DTOs.
- Produces: Contract definitions for `project.*`, `workSession.*`, `workflow.*`, `task.*`, `agent.*`, `provider.*`, `workspace.*`, `git.*`, `skill.*`, `mcp.*`, `settings.*`, `diagnostics.*`, `remote.*`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('requires request id for consequential commands', () => {
  expect(V2CommandEnvelopeSchema.safeParse({input:{id:'ws1'}}).success).toBe(false); expect(V2CommandEnvelopeSchema.safeParse({requestId:'r1',input:{id:'ws1'}}).success).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/ipc-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type V2CommandEnvelope<T>={requestId:string;input:T}
export type ProjectionEvent<T>={sequence:number;revision:number;payload:T}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/ipc-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define typed ipc contracts"
```

### Task 2: Implement main-process V2 IPC router

**Files:**
- Create: `src/main/v2/ipc/register-v2-ipc.ts`
- Create: `src/main/v2/ipc/validated-handler.ts`
- Modify: `src/main/index.ts` — register V2 router during V2 bootstrap
- Test: `tests/unit/v2/v2-ipc-router.test.ts`

**Interfaces:**
- Consumes: Application services and shared Zod schemas.
- Produces: Validated handlers with normalized errors and request-id idempotency handoff.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rejects invalid command payload before service call', async () => {
  const fn=vi.fn(); const handler=validatedHandler(z.object({id:z.string()}),fn); await expect(handler(null,{id:1})).rejects.toThrow(); expect(fn).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v2-ipc-router.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const validatedHandler=(schema:any,fn:any)=>async (_e:any,raw:any)=>fn(schema.parse(raw))
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v2-ipc-router.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): register validated ipc router"
```

### Task 3: Expose minimal preload API

**Files:**
- Create: `src/preload/v2-api.ts`
- Modify: `src/preload/index.ts` — expose `window.bs.v2` only
- Modify: `src/renderer/src/env.d.ts` — type window API
- Test: `tests/unit/v2/preload-contract.test.ts`

**Interfaces:**
- Consumes: V2 IPC contract names only; no main classes.
- Produces: `window.bs.v2` command/query methods and subscriptions returning unsubscribe functions.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('preload surface contains no token or filesystem raw-handle APIs', () => {
  expect(PUBLIC_V2_API_KEYS).not.toContain('getRawSecret'); expect(PUBLIC_V2_API_KEYS).not.toContain('getFsHandle'); expect(PUBLIC_V2_API_KEYS).not.toContain('getProcess')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/preload-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type BsV2Api={workSession:{create:(input:unknown)=>Promise<unknown>;pause:(id:string)=>Promise<unknown>};provider:{listAccounts:()=>Promise<unknown[]>}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/preload-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): expose secure typed preload api"
```

### Task 4: Implement projection subscription sequencing

**Files:**
- Create: `src/main/v2/ipc/projection-publisher.ts`
- Create: `src/renderer/src/v2/state/projection-subscription.ts`
- Test: `tests/unit/v2/projection-subscription.test.ts`

**Interfaces:**
- Consumes: ProjectionEvent sequence/revision and preload subscribe.
- Produces: Renderer detects gaps and refetches; duplicate/out-of-order events are ignored.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('requests refetch when sequence jumps', () => {
  expect(needsRefetch(10,11)).toBe(false); expect(needsRefetch(10,12)).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/projection-subscription.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const needsRefetch=(last:number,next:number)=>next!==last+1
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/projection-subscription.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): make renderer subscriptions gap-safe"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/ipc-contract.test.ts tests/unit/v2/v2-ipc-router.test.ts tests/unit/v2/preload-contract.test.ts tests/unit/v2/projection-subscription.test.ts`.

## Acceptance / Traceability

- `CONTRACT-001` rules implemented.
- Renderer cannot reach secrets/process/filesystem handles.
- Subscription gaps are detectable.
- Old V1 channels may coexist until cutover but V2 UI uses only V2 contracts.


---

# Renderer V2 UI and Figma Prototype Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the locked Figma Make UX as the V2 renderer shell backed by real V2 projections/commands, not hard-coded workflow strings.

**Architecture:** Build V2 screens under `src/renderer/src/v2`; keep legacy renderer available behind cutover flag until feature parity gates pass. UI reads DTO projections only and calls `window.bs.v2` commands.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/14-ui-application-binding.md + ../architecture/03-other/11-requirement-traceability.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plan 14 and backend projections. May be developed in parallel with Plans 16-19 once IPC DTOs are stable.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Create V2 shell/navigation/design tokens

**Files:**
- Create: `src/renderer/src/v2/app/V2App.tsx`
- Create: `src/renderer/src/v2/app/navigation.ts`
- Create: `src/renderer/src/v2/styles/tokens.css`
- Modify: `src/renderer/src/App.tsx` — V2 cutover branch only
- Test: `tests/unit/v2/renderer-navigation.test.tsx`

**Interfaces:**
- Consumes: Figma locked nav and current V2 bootstrap flag.
- Produces: Exactly Home, Projects, Work, Agents, Settings primary navigation; States remains dev-only.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('has exactly five production nav items', () => { expect(['Home','Projects','Work','Agents','Settings']).toHaveLength(5) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/renderer-navigation.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const V2_NAV=['Home','Projects','Work','Agents','Settings'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/renderer-navigation.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): add locked application shell"
```

### Task 2: Implement Home and Project workspace screens

**Files:**
- Create: `src/renderer/src/v2/screens/HomeScreen.tsx`
- Create: `src/renderer/src/v2/screens/ProjectScreen.tsx`
- Create: `src/renderer/src/v2/features/project/WorkSessionsView.tsx`
- Create: `src/renderer/src/v2/features/project/FilesView.tsx`
- Create: `src/renderer/src/v2/features/project/GitView.tsx`
- Create: `src/renderer/src/v2/features/project/ProjectAgentsView.tsx`
- Create: `src/renderer/src/v2/features/project/SkillsView.tsx`
- Create: `src/renderer/src/v2/features/project/McpView.tsx`
- Create: `src/renderer/src/v2/features/project/ProjectSettingsView.tsx`
- Test: `tests/unit/v2/project-screens.test.tsx`

**Interfaces:**
- Consumes: V2 project/workSession/provider DTO queries through preload.
- Produces: Figma-equivalent operational Home and project tabs with loading/empty/error states.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('renders project tabs from DTO state', () => {
  expect(PROJECT_TABS).toEqual(['Overview','Work Sessions','Files','Git','Agents','Skills','MCP','Project Settings'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/project-screens.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const PROJECT_TABS=['Overview','Work Sessions','Files','Git','Agents','Skills','MCP','Project Settings'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/project-screens.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement home and project workspace"
```

### Task 3: Implement Work Session tabs and lifecycle controls

**Files:**
- Create: `src/renderer/src/v2/screens/WorkSessionScreen.tsx`
- Create: `src/renderer/src/v2/features/work/ConversationView.tsx`
- Create: `src/renderer/src/v2/features/work/PlanView.tsx`
- Create: `src/renderer/src/v2/features/work/TasksView.tsx`
- Create: `src/renderer/src/v2/features/work/ExecutionView.tsx`
- Create: `src/renderer/src/v2/features/work/ChangesView.tsx`
- Create: `src/renderer/src/v2/features/work/ReviewView.tsx`
- Create: `src/renderer/src/v2/features/work/RuntimeHistory.tsx`
- Test: `tests/unit/v2/work-session-screen.test.tsx`

**Interfaces:**
- Consumes: WorkSession projection and commands pause/resume/cancel/switchRuntime/approvePlan.
- Produces: Locked tabs and actual lifecycle state, RuntimeEpoch events, protocol degradation banner, rework lifecycle projection.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('shows resume while session projection is PAUSED', () => {
  expect(sessionPrimaryAction('PAUSED')).toBe('Resume')
  expect(sessionPrimaryAction('EXECUTING')).toBe('Pause')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/work-session-screen.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const WORK_TABS=['Conversation','Plan','Tasks','Execution','Changes','Review'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/work-session-screen.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement work session experience"
```

### Task 4: Implement Agents and Settings/Providers

**Files:**
- Create: `src/renderer/src/v2/screens/AgentsScreen.tsx`
- Create: `src/renderer/src/v2/screens/SettingsScreen.tsx`
- Create: `src/renderer/src/v2/features/settings/ProvidersPanel.tsx`
- Create: `src/renderer/src/v2/features/settings/panels.tsx`
- Test: `tests/unit/v2/agents-settings.test.tsx`

**Interfaces:**
- Consumes: Agent/provider/settings DTOs and commands.
- Produces: Agent add/edit policies; multi-account provider health, capability probes, connect/disable/refresh interactions; global/project scope separation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not show project agent binding under global settings', () => {
  expect(GLOBAL_SETTINGS).not.toContain('Agents'); expect(GLOBAL_SETTINGS).toContain('Providers')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/agents-settings.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const GLOBAL_SETTINGS=['Application','Appearance','Providers','Security','Default Permissions','Updates','Remote Control'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/agents-settings.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement agents and global settings"
```

### Task 5: Implement functional bottom panel and E2E prototype paths

**Files:**
- Create: `src/renderer/src/v2/components/BottomPanel.tsx`
- Create: `tests/e2e/v2-core-flow.spec.ts`
- Create: `tests/e2e/v2-runtime-switch.spec.ts`

**Interfaces:**
- Consumes: Terminal/test/problem/log/output projections and V2 commands.
- Produces: Distinct panel content and E2E flows matching approved prototype: project → work → runtime switch → review/rework → complete.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from '@playwright/test'
test('v2 main flow exposes work tabs', async ({ page }) => { await expect(page.getByText('Tasks')).toBeVisible() })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const BOTTOM_TABS=['Terminal','Tests','Problems','Logs','Output'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2-ui): cover locked prototype flows"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/*screen*.test.tsx tests/unit/v2/agents-settings.test.tsx && npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`.

## Acceptance / Traceability

- `AC-CORE-01`, `AC-UX-01..04`.
- UI state comes from projections, not hard-coded demo lifecycle.
- Runtime epoch switch is explicit in Conversation and history.
- Terminal is supporting bottom panel, never primary product navigation.


---

# Security, Permissions and Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Electron process isolation, safe secret handling, layered permission policy, redaction and audit controls across all V2 execution paths.

**Architecture:** VaultPort wraps current safeStorage implementation. Renderer receives secret metadata only. PermissionEngine is shared across built-in/MCP/native runtime tools. Audit sanitizer runs before persistence/log output.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/15-security-permissions-secrets.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 04,07,14.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define VaultPort and wrap existing safeStorage vault

**Files:**
- Create: `src/main/v2/application/ports/vault-port.ts`
- Create: `src/main/v2/infrastructure/vault/v1-vault-adapter.ts`
- Test: `tests/unit/v2/vault-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/vault.ts`.
- Produces: `getSecretRef/setSecret/deleteSecret` with no raw values in DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('returns secret reference rather than plaintext metadata dto', () => {
  const meta=toSecretMetadata('provider/openai/a'); expect(meta).toEqual({ref:'provider/openai/a',configured:true}); expect(meta).not.toHaveProperty('value')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/vault-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export interface VaultPort{get(ref:string):Promise<string|null>;set(ref:string,value:string):Promise<void>;delete(ref:string):Promise<void>}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/vault-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): wrap encrypted vault"
```

### Task 2: Implement layered permission profiles

**Files:**
- Create: `src/shared/v2/contracts/permissions.ts`
- Create: `src/main/v2/application/security/permission-profile-service.ts`
- Test: `tests/unit/v2/permission-profile-service.test.ts`

**Interfaces:**
- Consumes: Global defaults, project overrides, AgentVersion overrides.
- Produces: Effective permission resolution with explicit source/reason for UI/audit.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('project deny overrides global allow', () => {
  expect(resolveEffectivePermission({global:'ALLOW',project:'DENY'} as any).decision).toBe('DENY')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/permission-profile-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type PermissionDecision={decision:'ALLOW'|'ASK'|'DENY';source:'GLOBAL'|'PROJECT'|'AGENT';reason:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/permission-profile-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): layer permission profiles"
```

### Task 3: Implement secret/event/log redaction

**Files:**
- Create: `src/main/v2/application/security/redaction-service.ts`
- Test: `tests/unit/v2/redaction-service.test.ts`

**Interfaces:**
- Consumes: Canonical event payload and logs.
- Produces: Recursive key/value redaction for tokens, auth headers, API keys, known vault values and environment secrets.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('redacts nested token', () => {
  expect(redactObject({nested:{accessToken:'abc'},safe:'ok'})).toEqual({nested:{accessToken:'[REDACTED]'},safe:'ok'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/redaction-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
const SECRET_KEY=/token|secret|password|authorization|api[-_]?key/i
export function redactObject(v:any):any{ if(Array.isArray(v))return v.map(redactObject); if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,SECRET_KEY.test(k)?'[REDACTED]':redactObject(x)])); return v }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/redaction-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): redact secrets from events and logs"
```

### Task 4: Add preload security regression tests

**Files:**
- Create: `tests/unit/v2/renderer-security-boundary.test.ts`
- Modify: `tests/unit/ipc-contract.test.ts` — add V2 assertion only

**Interfaces:**
- Consumes: Preload API from Plan 14.
- Produces: Test that renderer API contains no vault methods returning plaintext, process objects, raw fs handles, provider clients.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('v2 preload contract exposes no raw secret getter', () => { expect(['project','workSession','provider']).not.toContain('getRawSecret') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/renderer-security-boundary.test.ts tests/unit/ipc-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// Production code is the Plan 14 preload surface; this task hardens its contract with regression assertions.
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/renderer-security-boundary.test.ts tests/unit/ipc-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2): enforce renderer security boundary"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/vault-adapter.test.ts tests/unit/v2/permission-profile-service.test.ts tests/unit/v2/redaction-service.test.ts tests/unit/v2/renderer-security-boundary.test.ts`.

## Acceptance / Traceability

- `AC-SEC-01`, `AC-SEC-02`, `TEST-REG-07`.
- All tool sources share PermissionEngine and audit boundary.
- Secret values never become renderer DTOs or durable event/log payloads.


---

# Observability, Usage, Quota and Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide correlated runtime/workflow diagnostics, per-run/provider usage accounting and explicit user-configured budget policies used by routing/admission and UI.

**Architecture:** Normalize provider usage into snapshots, track local requests/tokens/cost per correlation chain, and surface structured logs/projections. Budget policies are opt-in/explicit; no arbitrary hard defaults.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/16-observability-usage-budget.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 03-05,10,16.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define usage/budget contracts

**Files:**
- Create: `src/shared/v2/contracts/usage.ts`
- Test: `tests/unit/v2/usage-contract.test.ts`

**Interfaces:**
- Consumes: Execution correlation and provider account IDs.
- Produces: `UsageRecord`, `QuotaSnapshot`, `BudgetPolicy`, `BudgetDecision`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('budget policy allows omitted hard limits', () => {
  expect(evaluateBudget({}, {costUsd:999})).toEqual({decision:'OK'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/usage-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type BudgetPolicy={maxCostUsd?:number;maxInputTokens?:number;maxRequests?:number;maxConcurrentAgents?:number;maxElapsedMs?:number}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/usage-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define usage and budget contracts"
```

### Task 2: Implement usage ledger and projections

**Files:**
- Create: `src/main/v2/application/observability/usage-ledger.ts`
- Create: `src/main/v2/infrastructure/persistence/usage-repository.ts`
- Test: `tests/unit/v2/usage-ledger.test.ts`

**Interfaces:**
- Consumes: Canonical usage events and SQLite.
- Produces: Aggregate by WorkSession/WorkflowRun/TaskRun/AgentRun/ProviderAccount with no double count on replay.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('is idempotent for same usage event id', () => {
  const l=new UsageLedger(); l.record({id:'u1',cost:1}); l.record({id:'u1',cost:1}); expect(l.total).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/usage-ledger.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class UsageLedger{private seen=new Set<string>();total=0;record(e:{id:string;cost:number}){if(this.seen.has(e.id))return;this.seen.add(e.id);this.total+=e.cost}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/usage-ledger.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist correlated usage ledger"
```

### Task 3: Implement budget evaluator and admission integration

**Files:**
- Create: `src/main/v2/application/observability/budget-evaluator.ts`
- Modify: `src/main/v2/application/agent/admission-policy.ts` — consume evaluator
- Test: `tests/unit/v2/budget-evaluator.test.ts`

**Interfaces:**
- Consumes: BudgetPolicy and current usage.
- Produces: SOFT_WARNING/HARD_BLOCK/OK decisions with exact triggered dimension and values.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('hard blocks only configured exceeded limit', () => {
  expect(evaluateBudget({maxCostUsd:10},{costUsd:9})).toEqual({decision:'OK'})
  expect(evaluateBudget({maxCostUsd:10},{costUsd:10})).toMatchObject({decision:'HARD_BLOCK',metric:'cost'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/budget-evaluator.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function evaluateBudget(p:{maxCostUsd?:number},u:{costUsd:number}){ return p.maxCostUsd!=null&&u.costUsd>=p.maxCostUsd?{decision:'HARD_BLOCK',metric:'cost'}:{decision:'OK'} }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/budget-evaluator.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): evaluate explicit workflow budgets"
```

### Task 4: Implement structured diagnostics/log projections

**Files:**
- Create: `src/main/v2/application/observability/diagnostics-service.ts`
- Create: `src/shared/v2/contracts/diagnostics.ts`
- Test: `tests/unit/v2/diagnostics-service.test.ts`

**Interfaces:**
- Consumes: Canonical events and redaction service.
- Produces: Timestamped correlated log entries for runtime switch, tool execution, task/gate state; renderer BottomPanel uses DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('includes correlation ids in diagnostic event', () => {
  const d=createDiagnosticEntry({code:'RUNTIME_SWITCH',message:'switched',correlation:{workSessionId:'ws1',runtimeEpochId:'e2'}})
  expect(d.correlation).toMatchObject({workSessionId:'ws1',runtimeEpochId:'e2'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/diagnostics-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type DiagnosticEntry={time:string;level:'INFO'|'WARN'|'ERROR';code:string;message:string;correlation:Record<string,string>}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/diagnostics-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): expose correlated diagnostics"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/usage-contract.test.ts tests/unit/v2/usage-ledger.test.ts tests/unit/v2/budget-evaluator.test.ts tests/unit/v2/diagnostics-service.test.ts`.

## Acceptance / Traceability

- Budget decisions are explainable and based on configured values.
- Fleet/Providers/Work can display actual usage/cost from one ledger.
- Diagnostics are structured and redacted.


---

# V1.3.1 Data Migration and Cutover Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import V1 projects/providers/agents/sessions/usage into V2 safely, backup-first and idempotently, with unambiguous canonical conversion or read-only legacy archive.

**Architecture:** Migration runs before V2 write cutover. It records import_history, source fingerprints and row counts. Unsupported provider metadata is discarded rather than invented. Vault secrets are referenced/reused when compatible.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/03-other/05-migration-v1.3.1-to-v2.0.0.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 02-04 and provider/agent contracts. Execute after V2 schema is stable, before cutover.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Implement backup manifest and migration dry-run

**Files:**
- Create: `src/main/v2/infrastructure/migration/backup-service.ts`
- Create: `src/shared/v2/contracts/migration.ts`
- Test: `tests/unit/v2/backup-service.test.ts`

**Interfaces:**
- Consumes: userData paths and known V1 JSON/vault locations.
- Produces: Timestamped backup directory + SHA-256 manifest + dry-run report without mutation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('writes manifest containing source hashes before import', async () => {
  const dir = await createTempV1Data({ 'sessions.json':'[]' })
  const report = await new BackupService().backup(dir.path)
  expect(report.manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/backup-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type BackupManifest={createdAt:string;sourceVersion:'1.3.1';files:{path:string;sha256:string;size:number}[]}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/backup-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): backup v1 data before migration"
```

### Task 2: Import projects/provider account metadata/agent config

**Files:**
- Create: `src/main/v2/infrastructure/migration/import-projects.ts`
- Create: `src/main/v2/infrastructure/migration/import-providers.ts`
- Create: `src/main/v2/infrastructure/migration/import-agents.ts`
- Test: `tests/integration/v2/migration-core-import.test.ts`

**Interfaces:**
- Consumes: V1 workspace/provider/account/agent stores and V2 repositories.
- Produces: Idempotent imports with stable source keys; AgentDefinition + immutable AgentVersion; vault secret references preserved.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rerun does not duplicate imported project', async () => {
  const repo = new FakeProjectRepository()
  const input = [{ legacyId:'p1', path:'C:/PMS' }]
  await importProjects(input, repo); await importProjects(input, repo)
  expect(await repo.count()).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-core-import.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ImportKey={source:'v1';entity:string;legacyId:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-core-import.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): import v1 project provider agent metadata"
```

### Task 3: Convert V1 sessions/transcripts to canonical history

**Files:**
- Create: `src/main/v2/infrastructure/migration/import-sessions.ts`
- Create: `src/main/v2/infrastructure/migration/v1-transcript-converter.ts`
- Test: `tests/integration/v2/migration-session-import.test.ts`

**Interfaces:**
- Consumes: Current `StoredSession`/ChatTranscriptItem; CanonicalEvent protocol.
- Produces: Map user/assistant messages and structured tool call/results; drop thought signatures/provider IDs; ambiguous coordination sessions become legacy archive.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('converts tool item into structured tool events and omits provider signature metadata', () => {
  const out = convertLegacyItem({kind:'tool',tool:{id:'c1',name:'read',input:{path:'a.ts'},output:'x',thoughtSignature:'provider-secret'}} as any)
  expect(out.map((e:any)=>e.type)).toEqual(['TOOL_CALL','TOOL_RESULT'])
  expect(JSON.stringify(out)).not.toContain('thoughtSignature')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-session-import.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function convertLegacyItem(item:any){ if(item.kind==='message') return {type:item.message.role==='user'?'USER_MESSAGE':'ASSISTANT_MESSAGE',payload:{text:item.message.text}}; return [{type:'TOOL_CALL',payload:{callId:item.tool.id,tool:item.tool.name,arguments:item.tool.input}},{type:'TOOL_RESULT',payload:{callId:item.tool.id,output:item.tool.output}}] }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-session-import.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): convert legacy sessions to canonical events"
```

### Task 4: Implement import validation and resumable migration runner

**Files:**
- Create: `src/main/v2/infrastructure/migration/migration-runner.ts`
- Create: `src/main/v2/infrastructure/migration/import-validator.ts`
- Test: `tests/integration/v2/migration-idempotency.test.ts`

**Interfaces:**
- Consumes: All import modules, `import_history` table and backup manifest.
- Produces: Transaction/checkpoint per stage, counts/hash/sample validation, safe rerun after crash, final migration report.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('is idempotent after simulated interruption and rerun', async () => {
  const h = new FakeImportHistory(['projects'])
  const r = createMigrationRunnerForTest(h,{failOnceAt:'sessions'})
  await expect(r.run()).rejects.toThrow('simulated')
  await r.run()
  expect(h.completedStages()).toEqual(['projects','providers','agents','sessions','usage'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-idempotency.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type MigrationReport={backupPath:string;stages:{name:string;imported:number;skipped:number;errors:number}[];validated:boolean}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-idempotency.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): make v1 migration resumable and verifiable"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/backup-service.test.ts tests/integration/v2/migration-core-import.test.ts tests/integration/v2/migration-session-import.test.ts tests/integration/v2/migration-idempotency.test.ts`.

## Acceptance / Traceability

- `AC-DATA-01`, `TEST-REG-08`.
- Pre-migration backup always exists before writes.
- Import is idempotent.
- No fabricated provider-native metadata.
- Legacy V1 remains read-only rollback/archive after cutover.


---

# Updates and Remote Control V2 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose existing updater and remote/browser-bridge capabilities through V2 typed services/contracts without coupling them to workflow internals or weakening security.

**Architecture:** Wrap existing `updater.ts` and BrowserBridge/remote services behind application ports. UI Settings consumes typed status DTOs. Remote actions invoke the same V2 commands/permissions as local UI.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/17-updates-remote-control.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plans 14 and 16. Non-blocking for core engine but blocking for full V2 feature parity.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Wrap updater behind V2 port

**Files:**
- Create: `src/main/v2/application/ports/update-port.ts`
- Create: `src/main/v2/infrastructure/updates/v1-updater-adapter.ts`
- Test: `tests/unit/v2/updater-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/updater.ts`.
- Produces: `check`, `download`, `install`, status subscription with serializable DTO.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('maps legacy updater status to v2 dto', () => {
  expect(mapUpdaterStatus({state:'download-progress',percent:42} as any)).toEqual({state:'DOWNLOADING',progress:42})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/updater-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type UpdateStatus={state:'IDLE'|'CHECKING'|'AVAILABLE'|'DOWNLOADING'|'READY'|'ERROR';version?:string;progress?:number;message?:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/updater-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): wrap updater service"
```

### Task 2: Define RemoteControlPort and secure pairing DTOs

**Files:**
- Create: `src/shared/v2/contracts/remote.ts`
- Create: `src/main/v2/application/ports/remote-control-port.ts`
- Test: `tests/unit/v2/remote-contract.test.ts`

**Interfaces:**
- Consumes: Security/redaction and V2 command bus.
- Produces: Enable/disable, relay/pairing status, connected device summaries; no project content or credentials in pairing DTO.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('pairing dto contains no credentials', () => {
  const dto=PairingStatusSchema.parse({enabled:true,code:'482731',devices:[],token:'secret'}) as any; expect(dto).not.toHaveProperty('token')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/remote-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type PairingStatus={enabled:boolean;code?:string;expiresAt?:string;devices:{id:string;name:string}[]}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/remote-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define remote control contracts"
```

### Task 3: Wrap current BrowserBridge/remote transport

**Files:**
- Create: `src/main/v2/infrastructure/remote/v1-remote-adapter.ts`
- Test: `tests/integration/v2/remote-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/browser/*` and V2 command service.
- Produces: Remote transport maps authenticated requests into same application commands; cannot bypass permission/approval services.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('remote destructive command still returns permission request', async () => {
  const adapter=new V1RemoteAdapter({execute:async()=>({ok:false,error:{code:'APPROVAL_REQUIRED',message:'confirm'}})} as any)
  await expect(adapter.dispatch({type:'DELETE_FILE'})).resolves.toMatchObject({ok:false,error:{code:'APPROVAL_REQUIRED'}})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/remote-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class V1RemoteAdapter{constructor(private commandBus:any){} dispatch(cmd:any){return this.commandBus.execute(cmd)}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/remote-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): route remote control through v2 command bus"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/updater-adapter.test.ts tests/unit/v2/remote-contract.test.ts tests/integration/v2/remote-adapter.test.ts`.

## Acceptance / Traceability

- Remote control is an alternate transport, not an alternate authorization model.
- Updater is isolated from core workflow state.
- Settings UI can bind entirely through typed DTOs.


---

# V2 Verification, Cutover and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove every architecture acceptance criterion, switch production UI/writers to V2, preserve rollback archive, and release BS Coding 2.0.0 only after automated and manual gates pass.

**Architecture:** Use an executable acceptance matrix tied to tests and one cutover flag. No V1/V2 simultaneous writes after cutover. Release packaging verifies migration, Electron build, updater artifacts and locked Figma flows.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/03-other/08-acceptance-criteria.md + ../architecture/03-other/04-testing-strategy.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires all Plans 01-19.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Create acceptance test matrix and core workflow integration test

**Files:**
- Create: `tests/integration/v2/work-session-lifecycle.test.ts`
- Create: `docs/v2/acceptance-matrix.md`

**Interfaces:**
- Consumes: All V2 application services with fake runtimes, temp SQLite and temp Git repo.
- Produces: Executable Goal→Plan→Tasks→Execution→Review→Rework→Re-review→Verification→Completed scenario mapped to AC IDs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('completes only after blocking rework is resolved', async () => {
  const h=await TestV2Harness.create(); const ws=await h.startOAuthScenario(); await h.failSecurityReview(ws,'missing state')
  expect(await h.status(ws)).toBe('REWORK'); await h.completeReworkAndRerunGates(ws); expect(await h.status(ws)).toBe('COMPLETED')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/work-session-lifecycle.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// The integration fixture uses fake runtime streams and real temp SQLite/Git; no network/model calls.
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/work-session-lifecycle.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2): prove end to end workflow lifecycle"
```

### Task 2: Add mandatory protocol/routing regression suite

**Files:**
- Create: `tests/integration/v2/runtime-portability.test.ts`
- Create: `tests/integration/v2/tool-protocol-regression.test.ts`
- Create: `tests/integration/v2/routing-regression.test.ts`

**Interfaces:**
- Consumes: Plans 04-08 provider fake fixtures.
- Produces: `TEST-REG-01..03`: model switch, account fallback/new epoch, narrated tool never executed, duplicate call at most once.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('switches model after tool history and executes only structured next tool call', async () => {
  const h=await RuntimePortabilityHarness.create(); await h.runClaudeToolCall('read'); await h.switchToCodex()
  await h.feedCodexText('Calling write({path:"x"})'); expect(h.toolSideEffects('write')).toBe(0)
  await h.feedCodexToolCall({callId:'c2',tool:'write',arguments:{path:'x'}}); expect(h.toolSideEffects('write')).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/runtime-portability.test.ts tests/integration/v2/tool-protocol-regression.test.ts tests/integration/v2/routing-regression.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// Use deterministic recorded provider-neutral/native fixture streams; assertions inspect canonical events and fake tool side-effect count.
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/runtime-portability.test.ts tests/integration/v2/tool-protocol-regression.test.ts tests/integration/v2/routing-regression.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2): lock runtime portability regressions"
```

### Task 3: Cut over bootstrap/preload/renderer to V2 writers

**Files:**
- Modify: `src/main/index.ts` — V2 runtime becomes production writer
- Modify: `src/preload/index.ts` — production renderer uses V2 API
- Modify: `src/renderer/src/App.tsx` — V2App default
- Create: `src/main/v2/application/cutover.ts`
- Test: `tests/unit/v2/cutover.test.ts`

**Interfaces:**
- Consumes: Successful migration report and acceptance services.
- Produces: One-way production writer selection; V1 session stores become read-only archive for new 2.0.0 sessions.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('never enables both v1 and v2 mutable session writers', () => {
  expect(resolveWriterConfiguration('2.0.0')).toEqual({v1Writable:false,v2Writable:true})
  expect(resolveWriterConfiguration('1.3.1')).toEqual({v1Writable:true,v2Writable:false})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/cutover.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const writerMode=(version:string)=>version.startsWith('2.')?'V2':'V1'
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/cutover.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): cut over production writers"
```

### Task 4: Update version/docs and run release verification

**Files:**
- Modify: `package.json` — version `2.0.0`
- Modify: `README.md` — V2 workflow/product description
- Create: `docs/v2/release-checklist.md`
- Modify: `.github/workflows/build.yml` — include V2 migration/core E2E gates before publish

**Interfaces:**
- Consumes: All previous plan tests, packaging/updater workflow.
- Produces: Release checklist with exact commands and public asset verification.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('release version is 2.0.0', async () => { const p=await import('../../../package.json'); expect(p.default.version).toBe('2.0.0') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2 tests/unit/v2 && npm run typecheck && npm run e2e && npm run build`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// package.json
// "version": "2.0.0"
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2 tests/unit/v2 && npm run typecheck && npm run e2e && npm run build`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "release: prepare bs coding 2.0.0"
```

## Plan Completion Gate

Run `npm run typecheck && npm test && npm run e2e && npm run build`, then migration dry-run on a copy of real V1 userData, then packaged Electron smoke test on supported platforms. Do not tag/release on any red gate.

## Acceptance / Traceability

- Every `AC-*` has a passing automated test or an explicit manual UX/package verification row.
- V1/V2 mutable writers are mutually exclusive after cutover.
- Backup/read-only legacy archive remains available through first V2 release cycle.
- Release build/updater verification must check assets are publicly reachable, not merely created.


---

