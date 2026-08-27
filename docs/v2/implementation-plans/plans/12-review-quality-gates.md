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
