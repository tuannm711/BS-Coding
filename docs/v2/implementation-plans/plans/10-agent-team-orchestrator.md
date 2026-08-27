# Agent Team and Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement project-scoped standard agent roles, deterministic assignment records, Orchestrator planning/dispatch contracts, concurrency controls and non-recursive worker topology.

**Architecture:** Orchestrator reasons about goal/plan and proposes assignments, but WorkflowEngine validates and dispatches them. Workers cannot recursively create invisible workers. Agent definitions are project resources with immutable versions.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/09-agent-team-orchestrator.md

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

Requires Plans 02,08-09.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define standard project agent profiles

**Files:**
- Create: `src/main/v2/application/agent/default-agent-profiles.ts`
- Test: `tests/unit/v2/default-agent-profiles.test.ts`

**Interfaces:**
- Consumes: AgentDefinition/AgentVersion contracts and permission profiles.
- Produces: Orchestrator, Architect, Backend Developer, Frontend Developer, Code Reviewer, Security Reviewer, QA/Tester, Integration Agent defaults.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { DEFAULT_AGENT_PROFILES } from '../../../src/main/v2/application/agent/default-agent-profiles'
it('separates security from qa', () => { expect(DEFAULT_AGENT_PROFILES.map(x=>x.name)).toContain('Security Reviewer'); expect(DEFAULT_AGENT_PROFILES.map(x=>x.name)).toContain('QA / Tester') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/default-agent-profiles.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const DEFAULT_AGENT_PROFILES=[
 {name:'Orchestrator',role:'COORDINATOR'},{name:'Architect',role:'SPECIALIST'},{name:'Backend Developer',role:'WORKER'},
 {name:'Frontend Developer',role:'WORKER'},{name:'Code Reviewer',role:'REVIEWER'},{name:'Security Reviewer',role:'REVIEWER'},
 {name:'QA / Tester',role:'REVIEWER'},{name:'Integration Agent',role:'SPECIALIST'}
] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/default-agent-profiles.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define standard agent team"
```

### Task 2: Implement assignment and dispatch service

**Files:**
- Create: `src/main/v2/application/agent/assignment-service.ts`
- Test: `tests/unit/v2/assignment-service.test.ts`

**Interfaces:**
- Consumes: Workflow runnable tasks, AgentVersion repository, AgentRunService.
- Produces: `assign(taskId,agentId)`, persisted Assignment, independent context packet, dispatch through AgentRunService.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('creates auditable assignment before execution', async () => {
  const writes:any[]=[], runs:any[]=[]; const svc=createAssignmentServiceForTest({save:async(a:any)=>writes.push(a),run:async(a:any)=>runs.push(a)})
  await svc.assignAndDispatch({taskRunId:'tr1',agentVersionId:'av1'}); expect(writes).toHaveLength(1); expect(runs).toHaveLength(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/assignment-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type Assignment={id:string;taskRunId:string;agentVersionId:string;createdAt:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/assignment-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist and dispatch agent assignments"
```

### Task 3: Implement Orchestrator policy guard

**Files:**
- Create: `src/main/v2/application/agent/orchestrator-policy.ts`
- Test: `tests/unit/v2/orchestrator-policy.test.ts`

**Interfaces:**
- Consumes: Tool permissions and workflow state.
- Produces: Default Orchestrator toolset excludes write/edit/bash destructive operations; plan/task creation commands go through WorkflowEngine.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { ORCHESTRATOR_DENIED_TOOLS } from '../../../src/main/v2/application/agent/orchestrator-policy'
it('denies write tools', () => expect(ORCHESTRATOR_DENIED_TOOLS).toContain('write'))
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/orchestrator-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const ORCHESTRATOR_DENIED_TOOLS=['write','edit','apply_patch','bash','revert','spawn_worker'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/orchestrator-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): enforce coordinator non-writing policy"
```

### Task 4: Add concurrency and budget admission policy

**Files:**
- Create: `src/main/v2/application/agent/admission-policy.ts`
- Test: `tests/unit/v2/admission-policy.test.ts`

**Interfaces:**
- Consumes: Configured project/session concurrency and budget settings; no invented hard defaults.
- Produces: `canDispatch` returns ALLOW/ASK/BLOCK with reason, based on explicit user policy and current usage.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not invent a hard budget when none configured', () => {
  expect(canDispatch({spent:999999})).toEqual({decision:'ALLOW'}); expect(canDispatch({hardLimit:10,spent:10})).toEqual({decision:'BLOCK'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/admission-policy.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function canDispatch(input:{hardLimit?:number;spent:number}){ if(input.hardLimit==null) return {decision:'ALLOW'}; return input.spent>=input.hardLimit?{decision:'BLOCK'}:{decision:'ALLOW'} }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/admission-policy.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): gate agent fanout by explicit policy"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/default-agent-profiles.test.ts tests/unit/v2/assignment-service.test.ts tests/unit/v2/orchestrator-policy.test.ts tests/unit/v2/admission-policy.test.ts`.

## Acceptance / Traceability

- `AC-WF-03`; default coordinator cannot write code.
- QA and Security roles are distinct.
- Worker recursion is not available in V2 default topology.
- Every assignment has identity, agent version and task correlation.
