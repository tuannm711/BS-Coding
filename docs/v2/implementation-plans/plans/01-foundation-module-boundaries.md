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
