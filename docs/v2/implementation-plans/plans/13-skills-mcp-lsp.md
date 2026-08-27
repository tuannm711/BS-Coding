# Skills, MCP and LSP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate project skills, MCP servers and LSP into V2 without allowing them to bypass the canonical tool, permission, event and audit boundaries.

**Architecture:** Wrap existing managers behind ports. Skills are resolved into immutable AgentVersion/WorkSession context snapshots. MCP tools are normalized to V2 ToolDefinitions before ProtocolGuard/PermissionEngine; LSP remains an explicit tool/diagnostic source.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/13-skills-mcp-lsp.md

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

Requires Plans 07-08. Can run before UI.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define Skill and MCP/LSP contracts

**Files:**
- Create: `src/shared/v2/contracts/skills.ts`
- Create: `src/shared/v2/contracts/mcp.ts`
- Create: `src/main/v2/application/ports/mcp-port.ts`
- Create: `src/main/v2/application/ports/lsp-port.ts`
- Test: `tests/unit/v2/extension-contracts.test.ts`

**Interfaces:**
- Consumes: Project/Agent IDs and ToolDefinition.
- Produces: Serializable SkillDefinition/SkillSnapshot, MCP server/tool descriptors, LSP diagnostics.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('skill snapshot records source and version', () => {
  const s = snapshotSkill({id:'planning',name:'planning',version:'1.4.0',source:'PROJECT',content:'x'})
  expect(s).toMatchObject({id:'planning',version:'1.4.0',source:'PROJECT'})
  expect(s.contentHash).toMatch(/^[a-f0-9]{64}$/)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/extension-contracts.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type SkillSnapshot={id:string;name:string;version:string;source:'BUILTIN'|'PROJECT'|'USER';contentHash:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/extension-contracts.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define skill mcp lsp contracts"
```

### Task 2: Implement skill resolver and snapshotter

**Files:**
- Create: `src/main/v2/application/skills/skill-resolver.ts`
- Test: `tests/unit/v2/skill-resolver.test.ts`

**Interfaces:**
- Consumes: Current skill discovery at edge and ArtifactStore/hash helper.
- Produces: Resolve precedence and immutable snapshots referenced by AgentVersion/RuntimeEpoch.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('project skill overrides same-name user skill by explicit precedence', () => {
  const out = resolveSkills([{name:'x',source:'USER'},{name:'x',source:'PROJECT'}] as any)
  expect(out.find((x:any)=>x.name==='x')?.source).toBe('PROJECT')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/skill-resolver.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const skillRank=(source:string)=>source==='PROJECT'?3:source==='USER'?2:1
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/skill-resolver.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): snapshot resolved skills"
```

### Task 3: Wrap existing MCP manager and normalize tools

**Files:**
- Create: `src/main/v2/infrastructure/mcp/v1-mcp-adapter.ts`
- Test: `tests/unit/v2/v1-mcp-adapter.test.ts`

**Interfaces:**
- Consumes: Current `src/main/agent/mcp/manager.ts`; V2 ToolDefinition.
- Produces: MCP tool adapter with serverId metadata; execution still enters V2 ToolExecutor.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not execute mcp directly from adapter mapping', async () => {
  const run = vi.fn(); const adapter = new V1McpAdapter({listTools:async()=>[{name:'query',run}]} as any)
  const defs = await adapter.listToolDefinitions()
  expect(defs[0].name).toBe('query'); expect(run).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-mcp-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type McpToolBinding={serverId:string;toolName:string;definition:unknown}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-mcp-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): route mcp tools through v2 guard"
```

### Task 4: Wrap LSP diagnostics and edit follow-up

**Files:**
- Create: `src/main/v2/infrastructure/lsp/v1-lsp-adapter.ts`
- Test: `tests/unit/v2/v1-lsp-adapter.test.ts`

**Interfaces:**
- Consumes: Current LSP manager and canonical artifact/finding contracts.
- Produces: Normalized diagnostics returned as tool output/evidence; no direct workflow mutation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('maps lsp diagnostic without changing task state', () => {
  const d = mapLegacyDiagnostic({uri:'a.ts',message:'x',severity:1,start:1,end:2} as any)
  expect(d).toMatchObject({uri:'a.ts',severity:'ERROR',message:'x'})
  expect(d).not.toHaveProperty('taskStatus')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/v1-lsp-adapter.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export type LspDiagnostic={uri:string;range:{start:number;end:number};severity:'ERROR'|'WARNING'|'INFO';message:string}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/v1-lsp-adapter.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): adapt lsp diagnostics"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/extension-contracts.test.ts tests/unit/v2/skill-resolver.test.ts tests/unit/v2/v1-mcp-adapter.test.ts tests/unit/v2/v1-lsp-adapter.test.ts`.

## Acceptance / Traceability

- MCP cannot bypass permissions/audit.
- Skill content used by an AgentRun is reproducible through snapshot/version/hash.
- LSP is evidence/diagnostics, not a hidden state machine.
