# Provider, Account, Model and Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all providers/accounts/models through V2 ports, verify model capabilities, and implement sticky AUTO/PREFERRED/PINNED account routing with health/cooldown/quota-aware scoring.

**Architecture:** Reuse V1 provider adapters through explicit compatibility wrappers first. Route to a RuntimeTarget; never bind an Agent directly to one mutable active account. RuntimeTarget stays sticky for the RuntimeEpoch.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/04-provider-account-model-routing.md

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

Requires Plans 01-04. Can execute in parallel with Plan 07 after contracts stabilize.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define ProviderPort and RuntimeTarget contracts

**Files:**
- Create: `src/shared/v2/contracts/provider.ts`
- Create: `src/main/v2/application/ports/provider-port.ts`
- Test: `tests/unit/v2/provider-contract.test.ts`

**Interfaces:**
- Consumes: Shared IDs and domain AgentVersion model.
- Produces: `ProviderSummary`, `ProviderAccountSummary`, `ModelCapability`, `RuntimeTarget`, `AccountPolicy`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { AccountPolicySchema } from '../../../src/shared/v2/contracts/provider'
it('accepts only routing policies', () => expect(AccountPolicySchema.safeParse('AUTO').success).toBe(true))
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/provider-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import { z } from 'zod'
export const AccountPolicySchema=z.enum(['AUTO','PREFERRED','PINNED'])
export type RuntimeTarget={providerId:string;accountId:string;modelId:string;capabilities:{structuredTools:'VERIFIED'|'DEGRADED'|'UNSUPPORTED'}}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/provider-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define provider routing contracts"
```

### Task 2: Wrap current ProviderManager/ProviderAdapter behind V2 port

**Files:**
- Create: `src/main/v2/infrastructure/providers/v1-provider-compat.ts`
- Modify: `src/main/connections/manager.ts` — expose read-only adapter methods only if needed
- Test: `tests/unit/v2/v1-provider-compat.test.ts`

**Interfaces:**
- Consumes: Current `ProviderAdapter`/ProviderManager and vault references; no V1 types escape adapter.
- Produces: `V1ProviderCompat` maps accounts/models/usage to V2 DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not expose provider secrets in summaries', async () => {
  const legacy={listAccounts:async()=>[{id:'a',providerId:'openai',enabled:true,token:'secret'}]}; const out=await new V1ProviderCompat(legacy).listAccounts()
  expect(out[0]).toEqual({id:'a',providerId:'openai',enabled:true}); expect(out[0]).not.toHaveProperty('token')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-provider-compat.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class V1ProviderCompat {
  constructor(private readonly legacy:any){}
  async listAccounts(){ return (await this.legacy.listAccounts()).map((a:any)=>({id:a.id,providerId:a.providerId,enabled:a.enabled!==false})) }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-provider-compat.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): wrap legacy providers behind port"
```

### Task 3: Implement capability probe service

**Files:**
- Create: `src/main/v2/application/providers/capability-probe.ts`
- Create: `src/main/v2/infrastructure/providers/probe-fixtures.ts`
- Test: `tests/unit/v2/capability-probe.test.ts`

**Interfaces:**
- Consumes: ProviderPort runtime creation and fake transports.
- Produces: Probe result for structured tool calls, streaming, reasoning, images, parallel tools with VERIFIED/DEGRADED/UNSUPPORTED.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('marks narrated-only tool behavior degraded', async () => {
  const runtime=fakeProbeRuntime([{kind:'text-delta',text:'Calling read({path:"a.ts"})'},{kind:'finish',reason:'stop'}]); const result=await probeStructuredTools(runtime,sampleReadTool())
  expect(result.structuredTools).toBe('DEGRADED')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/capability-probe.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type CapabilityProbeResult={structuredTools:'VERIFIED'|'DEGRADED'|'UNSUPPORTED';streaming:boolean;reasoning:'SUPPORTED'|'UNKNOWN'}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/capability-probe.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): verify runtime capabilities"
```

### Task 4: Implement sticky account router

**Files:**
- Create: `src/main/v2/runtime/routing/account-router.ts`
- Create: `src/main/v2/runtime/routing/router-score.ts`
- Test: `tests/unit/v2/account-router.test.ts`

**Interfaces:**
- Consumes: Account policy, quota/health snapshots, capability probe results.
- Produces: `route(input): RuntimeTarget`, deterministic scoring, PINNED refusal, PREFERRED fallback, AUTO health scoring; target immutable within epoch.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('prefers healthy enabled account and remains deterministic', () => {
  const candidates=[{id:'a',enabled:true,cooldown:false,quotaKnown:true,remaining:80,activeRuns:0},{id:'b',enabled:true,cooldown:false,quotaKnown:true,remaining:20,activeRuns:0}]
  expect(selectBestAccount(candidates).id).toBe('a'); expect(selectBestAccount(candidates).id).toBe('a')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/account-router.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function scoreAccount(a:{enabled:boolean;cooldown:boolean;quotaKnown:boolean;remaining?:number;activeRuns:number}){
  if(!a.enabled||a.cooldown) return -Infinity
  return (a.quotaKnown ? Math.max(0,a.remaining ?? 0) : 50) - a.activeRuns*10
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/account-router.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add sticky multi-account routing"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/provider-contract.test.ts tests/unit/v2/v1-provider-compat.test.ts tests/unit/v2/capability-probe.test.ts tests/unit/v2/account-router.test.ts`.

## Acceptance / Traceability

- `AC-PROV-01..03` covered by contracts/tests.
- Multiple accounts can be enabled simultaneously; no exclusive `activeAccountId` semantics in V2.
- Routing never uses secret material in renderer/shared contracts.
- Cooldown is scoped to account/pool and recorded for later routing decisions.
