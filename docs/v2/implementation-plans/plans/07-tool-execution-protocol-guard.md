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
