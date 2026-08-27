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
