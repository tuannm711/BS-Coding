# V1.3.1 Data Migration and Cutover Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import V1 projects/providers/agents/sessions/usage into V2 safely, backup-first and idempotently, with unambiguous canonical conversion or read-only legacy archive.

**Architecture:** Migration runs before V2 write cutover. It records import_history, source fingerprints and row counts. Unsupported provider metadata is discarded rather than invented. Vault secrets are referenced/reused when compatible.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/03-other/05-migration-v1.3.1-to-v2.0.0.md

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

Requires Plans 02-04 and provider/agent contracts. Execute after V2 schema is stable, before cutover.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Implement backup manifest and migration dry-run

**Files:**
- Create: `src/main/v2/infrastructure/migration/backup-service.ts`
- Create: `src/shared/v2/contracts/migration.ts`
- Test: `tests/unit/v2/backup-service.test.ts`

**Interfaces:**
- Consumes: userData paths and known V1 JSON/vault locations.
- Produces: Timestamped backup directory + SHA-256 manifest + dry-run report without mutation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('writes manifest containing source hashes before import', async () => {
  const dir = await createTempV1Data({ 'sessions.json':'[]' })
  const report = await new BackupService().backup(dir.path)
  expect(report.manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/backup-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type BackupManifest={createdAt:string;sourceVersion:'1.3.1';files:{path:string;sha256:string;size:number}[]}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/backup-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): backup v1 data before migration"
```

### Task 2: Import projects/provider account metadata/agent config

**Files:**
- Create: `src/main/v2/infrastructure/migration/import-projects.ts`
- Create: `src/main/v2/infrastructure/migration/import-providers.ts`
- Create: `src/main/v2/infrastructure/migration/import-agents.ts`
- Test: `tests/integration/v2/migration-core-import.test.ts`

**Interfaces:**
- Consumes: V1 workspace/provider/account/agent stores and V2 repositories.
- Produces: Idempotent imports with stable source keys; AgentDefinition + immutable AgentVersion; vault secret references preserved.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rerun does not duplicate imported project', async () => {
  const repo = new FakeProjectRepository()
  const input = [{ legacyId:'p1', path:'C:/PMS' }]
  await importProjects(input, repo); await importProjects(input, repo)
  expect(await repo.count()).toBe(1)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-core-import.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ImportKey={source:'v1';entity:string;legacyId:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-core-import.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): import v1 project provider agent metadata"
```

### Task 3: Convert V1 sessions/transcripts to canonical history

**Files:**
- Create: `src/main/v2/infrastructure/migration/import-sessions.ts`
- Create: `src/main/v2/infrastructure/migration/v1-transcript-converter.ts`
- Test: `tests/integration/v2/migration-session-import.test.ts`

**Interfaces:**
- Consumes: Current `StoredSession`/ChatTranscriptItem; CanonicalEvent protocol.
- Produces: Map user/assistant messages and structured tool call/results; drop thought signatures/provider IDs; ambiguous coordination sessions become legacy archive.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('converts tool item into structured tool events and omits provider signature metadata', () => {
  const out = convertLegacyItem({kind:'tool',tool:{id:'c1',name:'read',input:{path:'a.ts'},output:'x',thoughtSignature:'provider-secret'}} as any)
  expect(out.map((e:any)=>e.type)).toEqual(['TOOL_CALL','TOOL_RESULT'])
  expect(JSON.stringify(out)).not.toContain('thoughtSignature')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-session-import.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function convertLegacyItem(item:any){ if(item.kind==='message') return {type:item.message.role==='user'?'USER_MESSAGE':'ASSISTANT_MESSAGE',payload:{text:item.message.text}}; return [{type:'TOOL_CALL',payload:{callId:item.tool.id,tool:item.tool.name,arguments:item.tool.input}},{type:'TOOL_RESULT',payload:{callId:item.tool.id,output:item.tool.output}}] }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-session-import.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): convert legacy sessions to canonical events"
```

### Task 4: Implement import validation and resumable migration runner

**Files:**
- Create: `src/main/v2/infrastructure/migration/migration-runner.ts`
- Create: `src/main/v2/infrastructure/migration/import-validator.ts`
- Test: `tests/integration/v2/migration-idempotency.test.ts`

**Interfaces:**
- Consumes: All import modules, `import_history` table and backup manifest.
- Produces: Transaction/checkpoint per stage, counts/hash/sample validation, safe rerun after crash, final migration report.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('is idempotent after simulated interruption and rerun', async () => {
  const h = new FakeImportHistory(['projects'])
  const r = createMigrationRunnerForTest(h,{failOnceAt:'sessions'})
  await expect(r.run()).rejects.toThrow('simulated')
  await r.run()
  expect(h.completedStages()).toEqual(['projects','providers','agents','sessions','usage'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/integration/v2/migration-idempotency.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type MigrationReport={backupPath:string;stages:{name:string;imported:number;skipped:number;errors:number}[];validated:boolean}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/integration/v2/migration-idempotency.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): make v1 migration resumable and verifiable"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/backup-service.test.ts tests/integration/v2/migration-core-import.test.ts tests/integration/v2/migration-session-import.test.ts tests/integration/v2/migration-idempotency.test.ts`.

## Acceptance / Traceability

- `AC-DATA-01`, `TEST-REG-08`.
- Pre-migration backup always exists before writes.
- Import is idempotent.
- No fabricated provider-native metadata.
- Legacy V1 remains read-only rollback/archive after cutover.
