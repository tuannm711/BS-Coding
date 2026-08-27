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
