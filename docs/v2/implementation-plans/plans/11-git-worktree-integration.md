# Workspace and Git Worktree Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate parallel write tasks in Git worktrees/branches and integrate approved outputs through a dedicated Integration Agent/service with auditable conflict handling.

**Architecture:** WorkspacePort owns Git/process operations. Workflow Engine requests a task workspace; write-capable tasks never share a mutable checkout when concurrent. Integration merges into a workflow integration branch and creates explicit conflict tasks.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/10-workspace-git-isolation.md

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

Requires Plans 09-10.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define WorkspacePort and task workspace contract

**Files:**
- Create: `src/main/v2/application/ports/workspace-port.ts`
- Create: `src/shared/v2/contracts/workspace.ts`
- Test: `tests/unit/v2/workspace-contract.test.ts`

**Interfaces:**
- Consumes: Project/task/workflow IDs.
- Produces: `TaskWorkspace {path,branch,worktreeId,baseCommit}` and create/remove/status/merge methods.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('requires branch and base commit', () => {
  expect(taskBranch('wf1','T04',2)).toBe('bs/v2/wf1/T04/2')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workspace-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type TaskWorkspace={id:string;path:string;branch:string;baseCommit:string;taskRunId:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workspace-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define isolated workspace port"
```

### Task 2: Implement Git worktree manager

**Files:**
- Create: `src/main/v2/infrastructure/git/git-command.ts`
- Create: `src/main/v2/infrastructure/git/worktree-manager.ts`
- Test: `tests/integration/v2/worktree-manager.test.ts`

**Interfaces:**
- Consumes: Git CLI and temp repository fixture.
- Produces: `createTaskWorkspace`, deterministic branch naming `bs/v2/<workflow>/<task>/<attempt>`, cleanup without deleting unmerged work.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('creates two independent writable worktrees', async () => {
  const repo=await createTempGitRepo(); const mgr=new WorktreeManager(repo.root)
  const a=await mgr.createTaskWorkspace({workflowId:'wf',taskId:'A',attempt:1,baseCommit:repo.head})
  const b=await mgr.createTaskWorkspace({workflowId:'wf',taskId:'B',attempt:1,baseCommit:repo.head})
  expect(a.path).not.toBe(b.path); expect(a.branch).not.toBe(b.branch)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/worktree-manager.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const taskBranch=(workflowId:string,taskId:string,attempt:number)=>`bs/v2/${workflowId}/${taskId}/${attempt}`
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/worktree-manager.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): isolate task writes with git worktrees"
```

### Task 3: Implement integration merge service

**Files:**
- Create: `src/main/v2/application/workflow/integration-service.ts`
- Create: `src/main/v2/infrastructure/git/git-integration-adapter.ts`
- Test: `tests/integration/v2/integration-service.test.ts`

**Interfaces:**
- Consumes: Approved task outputs/worktrees and WorkflowEngine command interface.
- Produces: Merge approved task branches in deterministic task order; produce merged commit or structured conflict finding/task.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('turns merge conflict into explicit integration conflict outcome', async () => {
  const svc=new IntegrationService({merge:async()=>({kind:'CONFLICT',files:['src/auth.ts']})} as any)
  await expect(svc.integrate(['branch-a','branch-b'])).resolves.toEqual({kind:'CONFLICT',files:['src/auth.ts']})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/integration-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type IntegrationOutcome={kind:'MERGED';commit:string}|{kind:'CONFLICT';files:string[]}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/integration-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): integrate task branches deterministically"
```

### Task 4: Add workspace audit and cleanup policy

**Files:**
- Create: `src/main/v2/application/workflow/workspace-cleanup.ts`
- Test: `tests/unit/v2/workspace-cleanup.test.ts`

**Interfaces:**
- Consumes: Workflow terminal state and worktree status.
- Produces: Cleanup only after merged/archived; preserve conflict/cancelled worktree references until user chooses discard/archive.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not delete unmerged cancelled work', () => {
  expect(mayDeleteWorkspace({merged:false,archived:false})).toBe(false); expect(mayDeleteWorkspace({merged:true,archived:false})).toBe(true)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/workspace-cleanup.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const mayDeleteWorkspace=(x:{merged:boolean;archived:boolean})=>x.merged||x.archived
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/workspace-cleanup.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): protect unmerged task workspaces"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/integration/v2/worktree-manager.test.ts tests/integration/v2/integration-service.test.ts tests/unit/v2/workspace-cleanup.test.ts`.

## Acceptance / Traceability

- `AC-WF-02`, `TEST-REG-06`.
- No parallel writers share one checkout.
- Merge conflicts become modeled work, not hidden shell failures.
- Integration changes trigger quality gate reruns.
