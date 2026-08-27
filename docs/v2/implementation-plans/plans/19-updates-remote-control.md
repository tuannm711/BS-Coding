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
