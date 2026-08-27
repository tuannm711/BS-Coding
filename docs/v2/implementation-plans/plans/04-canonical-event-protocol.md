# Canonical Event Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the provider-neutral durable/streaming event protocol that becomes the single semantic history for conversations, tool execution, runtime changes, workflow changes and audit.

**Architecture:** Adapters produce normalized stream events; an assembler persists only meaningful completed events. Durable events carry schema version, correlation IDs, event IDs and monotonic sequence.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/02-canonical-event-protocol.md

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

Requires Plans 01-03.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Define canonical event schemas

**Files:**
- Create: `src/shared/v2/schemas/canonical-event.ts`
- Create: `src/shared/v2/contracts/events.ts`
- Test: `tests/unit/v2/canonical-event-schema.test.ts`

**Interfaces:**
- Consumes: ExecutionCorrelation from Plan 02.
- Produces: `CanonicalEvent` discriminated union including UserMessage, AssistantMessage, ToolCall, ToolResult, lifecycle, Approval, Finding, Artifact, Usage and Error.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { CanonicalEventSchema } from '../../../src/shared/v2/schemas/canonical-event'
it('rejects tool result without call id', () => { expect(CanonicalEventSchema.safeParse({ type:'TOOL_RESULT' }).success).toBe(false) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/canonical-event-schema.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
import { z } from 'zod'
export const CanonicalEventSchema=z.object({
  schemaVersion:z.literal(1), id:z.string().min(1), sequence:z.number().int().nonnegative(),
  type:z.string().min(1), occurredAt:z.string(), correlation:z.object({projectId:z.string(),workSessionId:z.string()}).passthrough(),
  payload:z.unknown()
})
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/canonical-event-schema.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): define canonical event schema"
```

### Task 2: Separate transient stream parts from durable events

**Files:**
- Create: `src/main/v2/runtime/canonical/stream-events.ts`
- Create: `src/main/v2/runtime/canonical/event-assembler.ts`
- Test: `tests/unit/v2/event-assembler.test.ts`

**Interfaces:**
- Consumes: Provider-neutral stream deltas and canonical durable schemas.
- Produces: Assembler that folds text/reasoning deltas into one completed AssistantMessage and persists no partial tool calls.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('folds text deltas into one assistant message', () => {
  const a=new EventAssembler(); a.accept({kind:'text-delta',text:'hello '}); a.accept({kind:'text-delta',text:'world'})
  expect(a.finish()).toEqual([{type:'ASSISTANT_MESSAGE',payload:{text:'hello world'}}])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/event-assembler.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export class EventAssembler {
  private text=''
  accept(part:{kind:string;text?:string}){ if(part.kind==='text-delta') this.text+=part.text ?? '' }
  finish(){ return this.text ? [{ type:'ASSISTANT_MESSAGE', payload:{ text:this.text } }] : [] }
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/event-assembler.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): assemble durable canonical messages"
```

### Task 3: Add event factory and redaction hooks

**Files:**
- Create: `src/main/v2/runtime/canonical/event-factory.ts`
- Create: `src/main/v2/runtime/canonical/event-redaction.ts`
- Test: `tests/unit/v2/event-redaction.test.ts`

**Interfaces:**
- Consumes: Clock/IdGenerator and security redaction policy seam.
- Produces: Factory that cannot create events without correlation; redactor removes credential-like fields before persistence/logging.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
import { redactEventPayload } from '../../../src/main/v2/runtime/canonical/event-redaction'
it('redacts authorization fields', () => { expect(redactEventPayload({authorization:'Bearer secret'} as any)).toEqual({authorization:'[REDACTED]'}) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/event-redaction.test.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export function redactEventPayload<T>(value:T):T {
  const copy=structuredClone(value as any);
  for(const k of Object.keys(copy ?? {})) if(/authorization|apiKey|token|secret/i.test(k)) copy[k]='[REDACTED]';
  return copy
}
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/event-redaction.test.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2): add canonical event factory redaction"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/canonical-event-schema.test.ts tests/unit/v2/event-assembler.test.ts tests/unit/v2/event-redaction.test.ts`.

## Acceptance / Traceability

- `COMP-EVENT-R01..R06` implemented.
- Provider SDK message objects are not stored as durable conversation truth.
- Tool calls/results remain structured and correlated.
- Deltas are transient; completed semantic events are durable.
