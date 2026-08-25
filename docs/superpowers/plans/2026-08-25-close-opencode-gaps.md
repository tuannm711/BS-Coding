# Close the opencode Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Close the four items the 2026-08-25 audit found still open, in the
order it recommends.

**Architecture:** Four independent changes. Each is test-first, each ends in its
own commit, and none depends on another — so a reviewer can reject one without
unpicking the rest.

**Tech Stack:** React 19 renderer, vitest, the existing `LlmClient` stub pattern.

## Global Constraints

- Do not raise `MAX_COMPACT_PER_RUN`. The cap stays at 2; this work makes
  reaching it recoverable.
- Do not migrate or rewrite stored snapshots. A `SnapshotTurn` written without a
  `calls` key must keep working for turn-level undo.
- Never call a real model in a test. Use the stub pattern from
  `tests/unit/agent-loop.test.ts`.
- The title request is fire-and-forget: a failure must leave the existing title
  and must never fail the turn.
- Test baseline: 142 files, **1019** tests. Each task states its running total.
- Do not tag or bump the version. The release happens after the final gate.

---

### Task 1: The stats surface

**Files:**
- Create: `src/renderer/src/components/settings/StatsTab.tsx`
- Modify: `src/renderer/src/components/settings/SettingsDialog.tsx`
- Create: `tests/unit/stats-tab.test.tsx`

**Interfaces:**
- Consumes: `window.api.getStats(): Promise<StatsSummary>`, already wired through
  preload.
- Produces: a `'stats'` member of `TabId`.

- [ ] **Step 1: Write the failing test**

`tests/unit/stats-tab.test.tsx`, following `tests/unit/quota-snapshot.test.tsx`
for the `renderToStaticMarkup` pattern:

```tsx
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import StatsTab from '../../src/renderer/src/components/settings/StatsTab'
import { formatStatsRows } from '../../src/renderer/src/components/settings/StatsTab'

describe('stats view model', () => {
  const summary = {
    totalCost: 1.2345,
    totalTokens: 12345,
    perModel: { 'gpt-5': { messages: 3, tokens: 900, cost: 0.5 }, 'claude-sonnet-4-6': { messages: 1, tokens: 100, cost: 0.75 } },
    perSession: [
      { id: 's1', title: 'Cheap', model: 'gpt-5', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0.1 } },
      { id: 's2', title: 'Dear', model: 'gpt-5', usage: { input: 9, output: 9, cacheRead: 0, cacheWrite: 0, cost: 0.9 } }
    ]
  }

  it('orders models and sessions by cost, dearest first', () => {
    const rows = formatStatsRows(summary)
    expect(rows.models.map(row => row.name)).toEqual(['claude-sonnet-4-6', 'gpt-5'])
    expect(rows.sessions.map(row => row.title)).toEqual(['Dear', 'Cheap'])
  })

  it('reports empty when nothing has been recorded', () => {
    const rows = formatStatsRows({ totalCost: 0, totalTokens: 0, perModel: {}, perSession: [] })
    expect(rows.empty).toBe(true)
  })

  it('renders the totals it was given', () => {
    vi.stubGlobal('window', { api: { getStats: async () => summary } })
    const markup = renderToStaticMarkup(React.createElement(StatsTab))
    expect(markup).toContain('Usage')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/stats-tab.test.tsx
```

Expected: FAIL, cannot resolve `StatsTab`.

- [ ] **Step 3: Implement**

`StatsTab.tsx` exports a default component and a named pure `formatStatsRows`.
Keeping the ordering and the empty check in a pure function is what makes the
first two tests possible without rendering.

```tsx
export function formatStatsRows(summary: StatsSummary) {
  const models = Object.entries(summary.perModel)
    .map(([name, usage]) => ({ name, ...usage }))
    .sort((a, b) => b.cost - a.cost)
  const sessions = [...summary.perSession].sort((a, b) => b.usage.cost - a.usage.cost)
  return { models, sessions, empty: models.length === 0 && sessions.length === 0 }
}
```

The component fetches on mount with `useEffect`, holds the summary in state, and
renders: a heading, the two totals, a per-model table and a per-session table.
Money uses `formatMoney` and counts use `formatCount`, both imported from
`../quota/quota-view`, so the numbers read the same as on the quota cards.

- [ ] **Step 4: Wire the tab**

In `SettingsDialog.tsx`: add `'stats'` to `TabId`, add
`{ id: 'stats', label: 'Usage' }` to `TABS` after `updates`, and render
`{tab === 'stats' && <StatsTab />}` beside the others.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1022**. Commit as `feat: show recorded usage in a settings tab`.

---

### Task 2: Classify a context overflow

**Files:**
- Modify: `src/shared/types.ts` (`ProviderErrorKind`)
- Modify: `src/shared/provider-state.ts` (`classifyProviderError`)
- Modify: `tests/unit/provider-state.test.ts`

**Interfaces:**
- Produces: `'context-overflow'` as a `ProviderErrorKind`. Task 3 consumes it.

- [ ] **Step 1: Write the failing test**

```ts
  it('classifies a length rejection separately from other bad requests', () => {
    for (const message of [
      'context_length_exceeded',
      "This model's maximum context length is 200000 tokens",
      'too many tokens in the request',
      'prompt is too long: 250000 tokens > 200000 maximum'
    ]) {
      expect(classifyProviderError(400, message).kind).toBe('context-overflow')
    }
    expect(classifyProviderError(400, 'missing required parameter').kind).toBe('invalid-request')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL — every case returns `invalid-request`.

- [ ] **Step 3: Implement**

Add `'context-overflow'` to the `ProviderErrorKind` union in
`src/shared/types.ts:272`.

In `classifyProviderError`, before the existing `statusCode === 400` branch:

```ts
  const overflow = normalized.includes('context_length_exceeded')
    || normalized.includes('maximum context length')
    || normalized.includes('too many tokens')
    || normalized.includes('prompt is too long')
```

then make the 400 arm `statusCode === 400 ? (overflow ? 'context-overflow' : 'invalid-request')`.

- [ ] **Step 4: Check nothing else switched on the union exhaustively**

```bash
npm run typecheck
```

A new union member breaks any exhaustive switch. Expected: clean, or a short list
of sites to extend — extend them, do not widen the type back.

- [ ] **Step 5: Verify and commit**

Expected: **1023**. Commit as
`feat: classify a context-length rejection as its own error kind`.

---

### Task 3: Recover from an overflow once

**Files:**
- Modify: `src/main/agent/loop.ts`
- Modify: `tests/unit/agent-loop.test.ts`

**Interfaces:**
- Consumes: `'context-overflow'` from Task 2.

- [ ] **Step 1: Write the failing tests**

Using the stub pattern already in that file: a model that errors with
`context_length_exceeded` on its first call and succeeds on the second.

```ts
  it('compacts and retries once when the provider rejects the request for length', async () => {
    // stub yields { kind: 'error', error: 'context_length_exceeded' } first, then a normal finish
    // expect: two stream calls, one 'compacted' event, a 'done' event, no 'error' event
  })

  it('surfaces the overflow when no compaction budget remains', async () => {
    // same stub, but the runner has already compacted MAX_COMPACT_PER_RUN times
    // expect: one 'error' event, no retry
  })
```

Write both bodies against the file's existing helpers rather than inventing new
scaffolding; read the top of `tests/unit/agent-loop.test.ts` first.

- [ ] **Step 2: Run to confirm failure**

Expected: the first test fails — one stream call, an `error` event, no retry.

- [ ] **Step 3: Implement**

In the `part.kind === 'error'` arm of the stream loop, and in the `catch` around
it, classify before emitting:

```ts
const state = classifyProviderError(undefined, message)
if (state.kind === 'context-overflow' && this.compactedThisRun < MAX_COMPACT_PER_RUN && !retriedOverflow) {
  retriedOverflow = true
  await this.compactIfOverThreshold(signal)
  continue
}
```

`retriedOverflow` is a per-step local, reset each step, so a step retries at most
once and the run stays bounded by `MAX_COMPACT_PER_RUN`.

`classifyProviderError` takes a status code it will not have here. Pass the
status when the thrown error carries one — `formatLlmError` already reads
`e.statusCode` — and `undefined` otherwise, matching on message alone.

- [ ] **Step 4: Verify and commit**

Expected: **1025**. Commit as
`fix: compact and retry once when a request is rejected for length`.

Body must say what this does not do: the cap stays at two per run, and a retry
that overflows again fails as before.

---

### Task 4: Model-written session titles

**Files:**
- Modify: `src/main/agent/session.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `tests/unit/session-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('asks for a title once, and keeps the old one when the request fails', async () => {
    // stub llm returns 'Fix the quota badge' first, then null
    // expect: first call sets the title; a second call for the same session does not run
    // expect: a failing call leaves the heuristic title untouched
  })
```

- [ ] **Step 2: Run to confirm failure**

- [ ] **Step 3: Implement**

Add a `titleSession` helper beside `compactTranscript` in
`src/main/agent/compact.ts` — it is the same non-streaming shape:

```ts
const TITLE_SYSTEM = 'Reply with a short title for this coding session. Five words at most. No quotes, no punctuation at the end.'
```

Call it from `BsAgentManager` after a turn reaches `done`, guarded by:

- the session title is still what `titleFrom` produced from the user's text,
- and no title request has run for this session — tracked in a `Set<string>` on
  the manager, not persisted, so a restart may retry once.

Store the result through the existing rename path so one code path writes titles.

Failures return null and are ignored.

- [ ] **Step 4: Verify and commit**

Expected: **1026**. Commit as `feat: ask the model for a session title once`.

Body must name the cost: one short non-streaming request per session, counted
against the account's provider quota.

---

### Task 5: Call-granular undo

**Files:**
- Modify: `src/main/agent/snapshot.ts`
- Modify: `src/main/agent/tools/snapshot-util.ts`
- Modify: `src/main/agent/tools/types.ts` (`ToolContext`)
- Modify: `tests/unit/agent-snapshot.test.ts`

**Interfaces:**
- Produces: `undoCall(scopeId: string, callId: string): SnapshotTurn | null`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('restores only the files one call touched', () => {
    // snapshot two files under call A and one under call B in the same turn
    // undoCall(scope, 'A') restores A's two files and leaves B's alone
  })

  it('still undoes a whole turn after a call has been undone', () => {
    // undoTurn restores what remains
  })

  it('undoes at turn level for a snapshot stored without call ids', () => {
    // write a SnapshotTurn with before but no calls, undoTurn restores it
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL — `undoCall` is not a function.

- [ ] **Step 3: Implement**

`SnapshotTurn` gains `calls?: Record<string, Record<string, string>>`.
`SnapshotStore.snapshot` gains an optional `callId` and, when given one, records
the file under both `before` and `calls[callId]`. The flat `before` stays the
turn-level view so `undoTurn` is untouched.

`undoCall(scopeId, callId)` finds the turn holding that call, writes back its
files, and removes the call from `calls` while leaving the turn in place.

`snapshotFile` in `snapshot-util.ts` takes the call id from `ToolContext`, which
gains `toolCallId?: string`. The loop already has the `ToolCallData` when it
invokes a tool — pass `call.id` through.

- [ ] **Step 4: Verify and commit**

Expected: **1029**. Commit as
`feat: record snapshots per tool call so one call can be undone`.

Body must say no stored snapshot is rewritten.

---

### Task 6: Verify and report

- [ ] **Step 1: Full verification**

```bash
npm test && npm run typecheck && npm run docs:toc
```

Check the exit status of each, not a grep of the output.

- [ ] **Step 2: Run the app**

Open Settings and confirm the Usage tab shows real numbers from the machine's own
history. Start a session and confirm it gets a model-written title rather than
the first line of the prompt.

- [ ] **Step 3: Update the audit and the debt**

`docs/superpowers/audits/2026-08-25-opencode-gap-audit.md` and debt item 9 both
list these four as open. Mark what landed, naming the commit.

- [ ] **Step 4: Report, propose, and stop**

Do not merge, tag, or push. Report all six tasks, then propose the next plan —
which, on the evidence of this audit, should start from the multi-account routing
goal rather than from another comparison list.
