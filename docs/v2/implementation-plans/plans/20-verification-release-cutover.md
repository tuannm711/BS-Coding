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
