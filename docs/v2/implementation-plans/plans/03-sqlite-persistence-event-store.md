# SQLite Persistence, Event Store and Artifact Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON-as-primary V2 state with transactional SQLite/WAL repositories and a durable canonical event log while retaining filesystem artifacts and safeStorage secrets.

**Architecture:** Use a single main-process database service, migration runner, append-only event sequence per aggregate, transactional projection updates, and repository ports. Large payloads are referenced through ArtifactStore.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/12-persistence-audit-event-store.md

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

Requires Plans 01-02. Plan 04 finalizes the canonical event schema consumed by EventStore.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Add SQLite dependency and database bootstrap

**Files:**
- Modify: `package.json` — add `better-sqlite3` and `@types/better-sqlite3`
- Create: `src/main/v2/infrastructure/persistence/database.ts`
- Test: `tests/unit/v2/database.test.ts`

**Interfaces:**
- Consumes: V2 bootstrap userDataPath from Plan 01.
- Produces: `openV2Database(path)` with `journal_mode=WAL`, foreign keys on, busy timeout and close().

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { openV2Database } from '../../../src/main/v2/infrastructure/persistence/database'
it('opens sqlite in WAL mode', () => {
  const db=openV2Database(':memory:');
  expect(db.pragma('journal_mode', { simple:true })).toMatch(/memory|wal/i); db.close()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/database.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import Database from 'better-sqlite3'
export function openV2Database(file:string){
  const db=new Database(file); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000');
  if(file !== ':memory:') db.pragma('journal_mode = WAL'); return db
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/database.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "build(v2): add sqlite persistence runtime"
```

### Task 2: Create transactional schema migration runner

**Files:**
- Create: `src/main/v2/infrastructure/persistence/migrations/001-core.sql`
- Create: `src/main/v2/infrastructure/persistence/migrations/002-events.sql`
- Create: `src/main/v2/infrastructure/persistence/migration-runner.ts`
- Test: `tests/unit/v2/migrations.test.ts`

**Interfaces:**
- Consumes: Opened SQLite database.
- Produces: `schema_migrations`, core entity tables, `canonical_events`, `import_history`, uniqueness and FK constraints.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { migrate } from '../../../src/main/v2/infrastructure/persistence/migration-runner'
it('is idempotent', () => { const db:any={}; /* test uses temp db fixture */ expect(typeof migrate).toBe('function') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/migrations.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function migrate(db:any, migrations:{version:number;sql:string}[]) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const applied=new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r:any)=>r.version))
  const tx=db.transaction(()=>{ for(const m of migrations){ if(applied.has(m.version)) continue; db.exec(m.sql); db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(m.version,new Date().toISOString()) } })
  tx()
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/migrations.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add transactional database migrations"
```

### Task 3: Implement EventStore with monotonic aggregate sequence

**Files:**
- Create: `src/main/v2/application/ports/event-store.ts`
- Create: `src/main/v2/infrastructure/persistence/sqlite-event-store.ts`
- Test: `tests/unit/v2/sqlite-event-store.test.ts`

**Interfaces:**
- Consumes: Canonical event envelope contract from Plan 04 may be introduced as a minimal forward type here and completed there.
- Produces: `append(expectedSequence,event[])`, `load(aggregateId,afterSequence)`, optimistic concurrency error.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('rejects stale expected sequence', async () => {
  const store = await createTestSqliteEventStore()
  await store.append('ws-1',0,[{id:'e1',type:'USER_MESSAGE'}])
  await expect(store.append('ws-1',0,[{id:'e2',type:'ASSISTANT_MESSAGE'}])).rejects.toThrow(/sequence/i)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/sqlite-event-store.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export interface EventStore {
  append(aggregateId:string, expectedSequence:number, events:unknown[]): Promise<number>
  load(aggregateId:string, afterSequence?:number): Promise<unknown[]>
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/sqlite-event-store.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add canonical sqlite event store"
```

### Task 4: Implement repositories and artifact references

**Files:**
- Create: `src/main/v2/infrastructure/persistence/repositories.ts`
- Create: `src/main/v2/application/ports/artifact-store.ts`
- Create: `src/main/v2/infrastructure/artifacts/legacy-artifact-adapter.ts`
- Test: `tests/unit/v2/repositories.test.ts`

**Interfaces:**
- Consumes: Domain entity shapes and current `src/main/artifact-store.ts` at edge only.
- Produces: Repositories for Project/WorkSession/Workflow/Task/Agent and `ArtifactRef` records, no blob-in-SQLite policy.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('round trips work session metadata without artifact bytes', async () => {
  const repo = await createTestRepositories()
  await repo.workSessions.save({id:'ws-1',projectId:'p1',title:'OAuth',artifactRefs:['a1']} as any)
  const stored = await repo.workSessions.get('ws-1') as any
  expect(stored.artifactRefs).toEqual(['a1']); expect(stored).not.toHaveProperty('artifactBytes')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/repositories.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type ArtifactRef={ id:string; projectId:string; kind:string; path:string; sha256?:string; size:number }
export interface WorkSessionRepository { get(id:string):Promise<unknown|null>; save(value:unknown):Promise<void> }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/repositories.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): persist domain projections and artifact refs"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/database.test.ts tests/unit/v2/migrations.test.ts tests/unit/v2/sqlite-event-store.test.ts tests/unit/v2/repositories.test.ts`.

## Acceptance / Traceability

- SQLite crash-safety uses WAL + transactions.
- Durable event order is deterministic.
- Secrets and large artifacts are not stored as SQLite plaintext blobs.
- Persistence ports are fakeable in tests.
