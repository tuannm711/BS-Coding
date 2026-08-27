# Observability, Usage, Quota and Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide correlated runtime/workflow diagnostics, per-run/provider usage accounting and explicit user-configured budget policies used by routing/admission and UI.

**Architecture:** Normalize provider usage into snapshots, track local requests/tokens/cost per correlation chain, and surface structured logs/projections. Budget policies are opt-in/explicit; no arbitrary hard defaults.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/16-observability-usage-budget.md

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

Requires Plans 03-05,10,16.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define usage/budget contracts

**Files:**
- Create: `src/shared/v2/contracts/usage.ts`
- Test: `tests/unit/v2/usage-contract.test.ts`

**Interfaces:**
- Consumes: Execution correlation and provider account IDs.
- Produces: `UsageRecord`, `QuotaSnapshot`, `BudgetPolicy`, `BudgetDecision`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('budget policy allows omitted hard limits', () => {
  expect(evaluateBudget({}, {costUsd:999})).toEqual({decision:'OK'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/usage-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type BudgetPolicy={maxCostUsd?:number;maxInputTokens?:number;maxRequests?:number;maxConcurrentAgents?:number;maxElapsedMs?:number}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/usage-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define usage and budget contracts"
```

### Task 2: Implement usage ledger and projections

**Files:**
- Create: `src/main/v2/application/observability/usage-ledger.ts`
- Create: `src/main/v2/infrastructure/persistence/usage-repository.ts`
- Test: `tests/unit/v2/usage-ledger.test.ts`

**Interfaces:**
- Consumes: Canonical usage events and SQLite.
- Produces: Aggregate by WorkSession/WorkflowRun/TaskRun/AgentRun/ProviderAccount with no double count on replay.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('is idempotent for same usage event id', () => {
  const l=new UsageLedger(); l.record({id:'u1',cost:1}); l.record({id:'u1',cost:1}); expect(l.total).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/usage-ledger.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class UsageLedger{private seen=new Set<string>();total=0;record(e:{id:string;cost:number}){if(this.seen.has(e.id))return;this.seen.add(e.id);this.total+=e.cost}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/usage-ledger.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist correlated usage ledger"
```

### Task 3: Implement budget evaluator and admission integration

**Files:**
- Create: `src/main/v2/application/observability/budget-evaluator.ts`
- Modify: `src/main/v2/application/agent/admission-policy.ts` — consume evaluator
- Test: `tests/unit/v2/budget-evaluator.test.ts`

**Interfaces:**
- Consumes: BudgetPolicy and current usage.
- Produces: SOFT_WARNING/HARD_BLOCK/OK decisions with exact triggered dimension and values.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('hard blocks only configured exceeded limit', () => {
  expect(evaluateBudget({maxCostUsd:10},{costUsd:9})).toEqual({decision:'OK'})
  expect(evaluateBudget({maxCostUsd:10},{costUsd:10})).toMatchObject({decision:'HARD_BLOCK',metric:'cost'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/budget-evaluator.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function evaluateBudget(p:{maxCostUsd?:number},u:{costUsd:number}){ return p.maxCostUsd!=null&&u.costUsd>=p.maxCostUsd?{decision:'HARD_BLOCK',metric:'cost'}:{decision:'OK'} }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/budget-evaluator.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): evaluate explicit workflow budgets"
```

### Task 4: Implement structured diagnostics/log projections

**Files:**
- Create: `src/main/v2/application/observability/diagnostics-service.ts`
- Create: `src/shared/v2/contracts/diagnostics.ts`
- Test: `tests/unit/v2/diagnostics-service.test.ts`

**Interfaces:**
- Consumes: Canonical events and redaction service.
- Produces: Timestamped correlated log entries for runtime switch, tool execution, task/gate state; renderer BottomPanel uses DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('includes correlation ids in diagnostic event', () => {
  const d=createDiagnosticEntry({code:'RUNTIME_SWITCH',message:'switched',correlation:{workSessionId:'ws1',runtimeEpochId:'e2'}})
  expect(d.correlation).toMatchObject({workSessionId:'ws1',runtimeEpochId:'e2'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/diagnostics-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type DiagnosticEntry={time:string;level:'INFO'|'WARN'|'ERROR';code:string;message:string;correlation:Record<string,string>}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/diagnostics-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): expose correlated diagnostics"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/usage-contract.test.ts tests/unit/v2/usage-ledger.test.ts tests/unit/v2/budget-evaluator.test.ts tests/unit/v2/diagnostics-service.test.ts`.

## Acceptance / Traceability

- Budget decisions are explainable and based on configured values.
- Fleet/Providers/Work can display actual usage/cost from one ledger.
- Diagnostics are structured and redacted.
