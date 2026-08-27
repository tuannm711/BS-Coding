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
