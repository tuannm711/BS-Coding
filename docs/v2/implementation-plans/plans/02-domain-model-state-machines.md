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
