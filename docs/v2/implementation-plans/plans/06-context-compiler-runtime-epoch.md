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
