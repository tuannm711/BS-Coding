# Security, Permissions and Secrets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Electron process isolation, safe secret handling, layered permission policy, redaction and audit controls across all V2 execution paths.

**Architecture:** VaultPort wraps current safeStorage implementation. Renderer receives secret metadata only. PermissionEngine is shared across built-in/MCP/native runtime tools. Audit sanitizer runs before persistence/log output.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/15-security-permissions-secrets.md

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

Requires Plans 04,07,14.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define VaultPort and wrap existing safeStorage vault

**Files:**
- Create: `src/main/v2/application/ports/vault-port.ts`
- Create: `src/main/v2/infrastructure/vault/v1-vault-adapter.ts`
- Test: `tests/unit/v2/vault-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/vault.ts`.
- Produces: `getSecretRef/setSecret/deleteSecret` with no raw values in DTOs.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('returns secret reference rather than plaintext metadata dto', () => {
  const meta=toSecretMetadata('provider/openai/a'); expect(meta).toEqual({ref:'provider/openai/a',configured:true}); expect(meta).not.toHaveProperty('value')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/vault-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export interface VaultPort{get(ref:string):Promise<string|null>;set(ref:string,value:string):Promise<void>;delete(ref:string):Promise<void>}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/vault-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): wrap encrypted vault"
```

### Task 2: Implement layered permission profiles

**Files:**
- Create: `src/shared/v2/contracts/permissions.ts`
- Create: `src/main/v2/application/security/permission-profile-service.ts`
- Test: `tests/unit/v2/permission-profile-service.test.ts`

**Interfaces:**
- Consumes: Global defaults, project overrides, AgentVersion overrides.
- Produces: Effective permission resolution with explicit source/reason for UI/audit.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('project deny overrides global allow', () => {
  expect(resolveEffectivePermission({global:'ALLOW',project:'DENY'} as any).decision).toBe('DENY')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/permission-profile-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type PermissionDecision={decision:'ALLOW'|'ASK'|'DENY';source:'GLOBAL'|'PROJECT'|'AGENT';reason:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/permission-profile-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): layer permission profiles"
```

### Task 3: Implement secret/event/log redaction

**Files:**
- Create: `src/main/v2/application/security/redaction-service.ts`
- Test: `tests/unit/v2/redaction-service.test.ts`

**Interfaces:**
- Consumes: Canonical event payload and logs.
- Produces: Recursive key/value redaction for tokens, auth headers, API keys, known vault values and environment secrets.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('redacts nested token', () => {
  expect(redactObject({nested:{accessToken:'abc'},safe:'ok'})).toEqual({nested:{accessToken:'[REDACTED]'},safe:'ok'})
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/redaction-service.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
const SECRET_KEY=/token|secret|password|authorization|api[-_]?key/i
export function redactObject(v:any):any{ if(Array.isArray(v))return v.map(redactObject); if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,SECRET_KEY.test(k)?'[REDACTED]':redactObject(x)])); return v }
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/redaction-service.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): redact secrets from events and logs"
```

### Task 4: Add preload security regression tests

**Files:**
- Create: `tests/unit/v2/renderer-security-boundary.test.ts`
- Modify: `tests/unit/ipc-contract.test.ts` — add V2 assertion only

**Interfaces:**
- Consumes: Preload API from Plan 14.
- Produces: Test that renderer API contains no vault methods returning plaintext, process objects, raw fs handles, provider clients.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('v2 preload contract exposes no raw secret getter', () => { expect(['project','workSession','provider']).not.toContain('getRawSecret') })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/renderer-security-boundary.test.ts tests/unit/ipc-contract.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
// Production code is the Plan 14 preload surface; this task hardens its contract with regression assertions.
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/renderer-security-boundary.test.ts tests/unit/ipc-contract.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2): enforce renderer security boundary"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/vault-adapter.test.ts tests/unit/v2/permission-profile-service.test.ts tests/unit/v2/redaction-service.test.ts tests/unit/v2/renderer-security-boundary.test.ts`.

## Acceptance / Traceability

- `AC-SEC-01`, `AC-SEC-02`, `TEST-REG-07`.
- All tool sources share PermissionEngine and audit boundary.
- Secret values never become renderer DTOs or durable event/log payloads.
