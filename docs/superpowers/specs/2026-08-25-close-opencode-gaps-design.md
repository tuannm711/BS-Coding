# Close the opencode gaps — design

Date: 2026-08-25
Branch: `feat/close-opencode-gaps`
Release: v1.1.5

Four items remain from `docs/superpowers/audits/2026-08-25-opencode-gap-audit.md`.
They are independent and are done in the order the audit recommends, judged by
what the multi-account goal needs rather than by opencode parity.

Two estimates in that audit were wrong and are corrected here. Both were wrong in
the same direction — claiming something is missing that is partly present — and
both were found by reading the source rather than the summary.

## 1. A stats surface

**Problem.** `getStats()` computes `StatsSummary` in
`src/main/bs-agent-manager.ts`, `Channels.StatsGet` carries it, `AgentApi`
declares it and `src/preload/index.ts` implements it. Nothing in `src/renderer`
calls it. The pipe is complete to `window.api.getStats()` and the last consumer
is missing.

`StatsSummary` is `totalCost`, `totalTokens`, `perModel: Record<string, ModelUsage>`
and `perSession: Array<{ id, title, model, usage }>`.

**Approach.** A `StatsTab` in the settings dialog, following `UpdatesTab` — a
function component that fetches on mount and renders. `TabId` gains `'stats'` and
the `TABS` array a row.

The tab shows the two totals, a per-model table of messages, tokens and cost, and
a per-session table sorted by cost. Cost uses the existing `formatMoney`, counts
use `formatCount`, both from `quota-view.ts`, so numbers read the same as they do
on the quota cards.

**Why first.** Quota answers how much an account has left; stats answer what it
has spent and on which model. An orchestrator choosing between accounts needs
both, and this half currently exists and cannot be seen.

## 2. Compaction robustness

**Problem, restated correctly.** Both halves of the original audit item are
built: `pruneToolOutputs` prunes, and `compactIfOverThreshold` runs at the top of
every step so the turn continues into the next model call. What remains is
narrower.

A cap: `MAX_COMPACT_PER_RUN` is 2, after which `compactIfOverThreshold` returns
early and the turn proceeds with a context it already measured as over the limit.

A blind spot: detection is proactive only. When the provider rejects a request
for length, `src/main/agent/loop.ts` emits `error` and returns. The turn dies
with no attempt to recover, and `classifyProviderError` has no kind for it — a
400 lands in `invalid-request` alongside everything else.

**Approach.** Two changes.

Add `'context-overflow'` to `ProviderErrorKind`, classified from a 400 whose
message matches the shapes providers use — `context_length_exceeded`,
`maximum context length`, `too many tokens`, `prompt is too long`.

In the loop's error path, when the error classifies as `context-overflow` and a
compaction budget remains, force one compaction and retry the step once instead
of ending the turn. If no budget remains, or the retry also overflows, surface
the error as today.

**Why second.** Both failures only appear in long turns, which is what an
orchestrator driving a project will produce.

## 3. LLM session titles

**Problem.** `renameSession` and `renameProjectSession` exist, so manual renaming
works. The automatic title is `titleFrom` in `src/main/agent/session.ts`: the
first non-empty line of the first user message, truncated to 60 characters. A
session that starts "can you look at this" is titled exactly that.

**Approach.** After the first assistant turn completes, if the session title is
still the one derived from the user's text, ask the model for a short title in a
single non-streaming call and store it with the existing rename path.

The call is fire-and-forget: it must not block the turn, and a failure leaves the
heuristic title in place. It runs once per session, guarded by a flag so a
retried turn does not re-title.

**Why third.** It does not serve the routing goal. It is cheap and it makes a
project with many sessions navigable.

## 4. Message-granular undo

**Problem, corrected.** The audit said this needs an identity below `turnId` in
the transcript. That is wrong: `ChatMessage.id` and `ToolCallData.id` both exist.
The identity is there and is not threaded through.

`snapshot-util.ts` calls `ctx.snapshots.snapshot(scopeId, filePath, content)`
with no call id, so `SnapshotTurn.before` is a flat `Record<string, string>` for
the whole turn. Undo is therefore turn-granular because of what the snapshot
records, not because of what the transcript knows.

**Approach.** Thread the tool call id into the snapshot. `SnapshotTurn` gains
`calls?: Record<string, Record<string, string>>` mapping a call id to the files
that call touched, alongside the existing flat `before` which stays as the
turn-level view. `undoCall(scopeId, callId)` restores one call's files.

Existing snapshots have no `calls` key. They keep working for turn-level undo and
report no call-level entries, so no migration runs and no stored data is
rewritten.

**Why last.** It is the largest of the four even at the corrected size, and no
evidence has been offered that turn-granular undo is insufficient — `undoTurn`
already targets any turn, not only the most recent.

## Verification

1. `StatsTab` renders totals, per-model and per-session from a stubbed
   `getStats`, and shows an empty state when there are no sessions.
2. `classifyProviderError` returns `context-overflow` for each of the four
   message shapes at status 400, and does not for an unrelated 400.
3. The loop retries once after a context-overflow error when budget remains, and
   surfaces the error when it does not — both driven by the existing LLM stub.
4. A title is requested once per session, is not requested when the session was
   renamed, and a failed request leaves the previous title.
5. `undoCall` restores only the files one call touched; `undoTurn` still restores
   the whole turn; a snapshot stored without `calls` still undoes at turn level.
6. `npm test` and `npm run typecheck` pass. The design-doc guards still pass.
7. The app runs, the Stats tab shows real numbers, and a session gets a
   model-written title.

## Risks

**The overflow retry loops.** The retry is capped at one per step and still
bounded by `MAX_COMPACT_PER_RUN`, so a request that overflows after compaction
fails as it does today rather than retrying forever.

**The title call costs a request against the user's quota.** One short
non-streaming call per session. It is worth naming because this project counts
requests against provider limits.

**`SnapshotTurn` grows.** Storing files twice — flat and per call — doubles a
snapshot's size. `MAX_SNAPSHOTS` is 50, and the content is already stored in
full, so the ceiling moves but does not change character.

## Out of scope

**Raising `MAX_COMPACT_PER_RUN`.** The cap is deliberate. This work makes hitting
it recoverable rather than removing it.

**A stats surface anywhere but settings.** No chart, no export.

**Titling existing sessions retroactively.**

## Success criteria

The Stats tab shows real numbers; a context-overflow error is classified and
recovered from once; new sessions get a model-written title; `undoCall` restores
one call's files while turn-level undo keeps working on data written before it.
