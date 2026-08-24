# Shared Session with Multi-Agent Switching Design

**Date:** 2026-08-24

**Status:** Approved design awaiting written-spec review

## Goal

Allow one native chat session to use multiple configured Agents sequentially. Switching the selected Agent changes who executes the next turn while preserving one continuous transcript, context, todo list, usage total, undo/redo history, and session lifecycle.

This design replaces the current UI-only shared chat behavior. Today the renderer shows one chat frame, but sessions, active-session lookup, transcripts, queues, runners, and usage remain keyed by Agent. The new design makes the session project-owned and records the executing Agent on each turn.

## Scope

### Included

- Project-scoped native chat sessions that can switch Agents between turns.
- Provider-neutral context transfer across OpenAI, Antigravity Gemini, Antigravity Claude/GPT, and other registered native providers.
- Per-turn Agent/provider/account/model/speed attribution.
- Agent switching lock while a turn, permission prompt, or queued message is active.
- Project-scoped session history, todos, context compaction, usage totals, undo, and redo.
- Migration of every existing Agent-owned session into an independent shared project session.
- Historical attribution that survives Agent configuration changes and Agent deletion.
- Selected-Agent quota in the right panel and aggregate session usage in the context footer.

### Excluded

- Concurrent Agent turns inside one session.
- Automatic Agent routing, delegation, consensus, or orchestration.
- Combining multiple legacy sessions during migration.
- Replaying provider-specific tool-call metadata across providers.
- Changing PTY terminal Agent behavior.

## Future Feature: Multi-Agent Coordinator

A future feature may introduce a Coordinator that delegates work to multiple Agents, manages parallel or dependent tasks, and synthesizes their results. It will require its own design for orchestration policy, permissions, context isolation, concurrency, cost controls, conflict handling, and UI. No Coordinator backend, placeholder control, or simulated behavior is introduced by this change.

## Data Model

### Shared session ownership

`StoredSession` becomes project-owned instead of Agent-owned. The first release retains the legacy `agentId` field as an optional migration/rollback field but no longer uses it as the session ownership key.

The persisted session contains:

```ts
interface StoredSession {
  id: string
  projectPath: string
  lastAgentId?: string
  legacyAgentId?: string
  title: string
  items: ChatTranscriptItem[]
  todos: TodoItem[]
  usage: UsageSummary
  schemaVersion: 2
  createdAt: number
  updatedAt: number
}
```

Session listing, latest-session lookup, creation, deletion, renaming, and active-session selection use normalized `projectPath` plus `sessionId`. Main process keeps one active session ID per project.

### Per-turn execution snapshot

Each user turn and its resulting assistant/tool items share a stable `turnId`. The execution snapshot is captured when the turn starts and is immutable:

```ts
interface TurnExecutionSnapshot {
  turnId: string
  agentId: string
  agentName: string
  providerId: string
  accountId?: string
  accountLabel?: string
  modelId: string
  modelLabel?: string
  speed: 'standard' | 'fast'
  startedAt: number
  completedAt?: number
  status: 'running' | 'completed' | 'stopped' | 'failed'
}
```

The snapshot contains identifiers and display labels only. It never contains access tokens, refresh tokens, API keys, authorization headers, raw provider responses, or vault data.

User messages record the target `turnId`. Assistant messages and tool results record the same `turnId` and execution snapshot reference. Historical UI labels therefore remain stable after the Agent is renamed, reconfigured, deactivated, or deleted.

## Component Boundaries

### SessionStore

`SessionStore` owns schema migration and project-scoped persistence. It provides project-based list/latest/create operations, item mutation by session ID, usage aggregation, todos, and idempotent migration. It does not resolve providers or run models.

### SharedSessionCoordinator

`SharedSessionCoordinator` owns the active session per project, the session's selected Agent, execution lock, queued messages, pending prompts, and deterministic Agent fallback. It exposes session-centric operations to IPC and delegates actual model execution to the existing Agent runtime. It is introduced as a dedicated component composed by `BsAgentManager`; the manager delegates session operations to it instead of duplicating project/session/Agent key conversion across IPC handlers.

### NeutralContextCompiler

`NeutralContextCompiler` converts stored multi-provider transcript items into model input for the Agent selected for the next turn. It has no persistence or renderer dependency and is independently testable.

### AgentRuntime

The existing Agent runtime remains the authority for the selected Agent's system prompt, mode, provider, account, model, speed, tools, and model-specific request handling. A runtime receives a session ID, execution snapshot, and neutral context; it does not own the session.

### Renderer

`ChatPanel` is keyed by session ID, not Agent ID. Agent selection is controlled state within the open session. Changing the selected Agent updates Agent-specific controls, quota, model variant, and send target without remounting the feed or loading a different transcript.

## Neutral Context Rules

The next Agent receives the semantic content of the shared session without provider-specific replay artifacts.

1. Preserve all user text and supported image attachments.
2. Preserve completed assistant text and reasoning only when the existing product policy permits reasoning persistence.
3. Convert completed tool activity into bounded textual records containing tool name, success/failure state, relevant input summary, and truncated output.
4. Remove provider tool-call IDs, Google thought signatures, raw function-call argument streams, response IDs, continuation handles, and provider options.
5. Exclude incomplete tool calls from the next request.
6. Preserve partial assistant text from a stopped or failed turn as visibly incomplete history, but mark it as incomplete in neutral context.
7. Apply the newly selected Agent's current system prompt and mode only to the next execution. Historical content is not rewritten.
8. Apply existing context limits and compaction to the shared session. The compacted summary must retain Agent attribution and essential tool outcomes in provider-neutral text.

The compiler emits valid user/assistant content without unpaired tool-role messages. This avoids cross-provider schema failures while retaining the information required to continue the work.

## Runtime Flow

### Opening a project or session

1. Load the project's shared session list.
2. Select the persisted active session or the latest session; create one only when none exists.
3. Resolve `lastAgentId`. Keep it when the Agent exists and is native; otherwise choose the Agent named `bs`, then the first available native Agent, then no selection.
4. Load the session transcript once. Agent selection changes do not reload it.

### Switching Agent

Agent switching is allowed only when the session has no running turn, pending permission/question prompt, or queued message. A successful switch updates `lastAgentId`, Agent-specific controls, and right-panel quota. It does not create a session, change the active session, compact context, or mutate historical execution snapshots.

### Sending a turn

1. Validate the session, selected Agent, assignment, provider account, and model.
2. Acquire an exclusive lock for `sessionId`.
3. Create an immutable execution snapshot and append the user message with a new `turnId`.
4. Compile the shared transcript into provider-neutral context.
5. Run the selected Agent with its current system prompt and assignment.
6. Append streaming assistant content and completed tool activity under the same `turnId`.
7. On success, record exact provider/account/model usage, update shared session usage, complete the execution snapshot, update `lastAgentId`, and emit a complete session/provider snapshot.
8. Drain queued messages using the Agent snapshot selected when the queue was created.
9. Release the session lock only after the turn and queue are complete, stopped, or failed.

Only one turn may write to a session at a time. Different Agents cannot produce interleaved output in the same session.

## Interaction Design

- The existing Agent picker remains in the composer.
- During execution, pending prompts, or queue drain, the picker is disabled and exposes the reason `Agent locked while running` through visible state and accessible description.
- Each assistant turn displays a compact `Agent · model` badge.
- Badge tooltip contains the provider and account label captured at execution time.
- Deleted or renamed Agents do not change historical badges.
- The right-panel quota card follows the currently selected Agent's account and matching model family.
- The context footer shows aggregate token and cost totals for the whole shared session.
- The Session Bar lists project sessions, independent of selected Agent.
- Changing Agent never clears the transcript, scroll position, todos, or current session title.

## Queue, Prompt, Stop, and Failure Semantics

- Messages queued while a turn runs are bound to the execution Agent already holding the session lock. The picker remains disabled until the queue is empty.
- A pending permission or question prompt retains the executing Agent and lock. Responses are routed by `sessionId`, `turnId`, and prompt ID.
- Stop aborts the active runtime, resolves pending prompts, marks the execution `stopped`, clears every queued message for that session, emits the empty queue state, and then releases the lock.
- A runtime failure marks the execution `failed`, retains received partial text with an incomplete marker, excludes incomplete tool calls from future context, and releases the lock.
- Failed/stopped turns do not increment the successful request ledger or aggregate session usage. Provider-reported partial token data remains diagnostic log data and is not rendered as completed usage.
- Renderer discards events whose `sessionId` or `turnId` does not match the active execution view.

## Undo, Redo, Todos, and Compaction

- Undo targets the latest completed turn in the open session regardless of which Agent executed it.
- File rollback resolves the snapshot recorded for that turn and executing Agent.
- Redo restores the removed transcript items, their execution attribution, and the recorded filesystem snapshot without issuing another provider request.
- Todos belong to the shared session. Any selected Agent may read or update them in a later turn.
- Compaction uses aggregate shared-session context. The compacted marker and summary are part of the same session and remain available after Agent switching.

## Agent Deletion and Assignment State

Deleting an Agent never deletes a shared session or historical items. If the deleted Agent is selected, the coordinator falls back to `bs`, then the first available native Agent, then no selection. Historical execution snapshots continue to display the deleted Agent's captured name and model.

An Agent with an invalid, inactive, or needs-review assignment may remain visible for configuration awareness, but sending is disabled with a precise assignment error. Selecting such an Agent must not silently substitute the first provider, account, or model.

## Migration

Migration is versioned and idempotent:

1. Read each legacy session independently.
2. Preserve ID, project path, title, transcript, todos, usage, and timestamps.
3. Copy legacy `agentId` into `legacyAgentId` and `lastAgentId`.
4. Attribute legacy assistant/tool items without snapshots to a generated legacy execution snapshot based on the owning Agent's persisted configuration when available. Missing provider/account/model metadata remains explicitly unavailable rather than fabricated.
5. Set `schemaVersion: 2` and persist atomically.
6. Never merge two legacy sessions and never create duplicate sessions when migration runs again.

The release retains enough legacy ownership data for rollback. Removal of legacy fields requires a later migration after this release is validated.

## IPC and Event Contract

Session operations become session-centric and carry `projectPath` plus `sessionId`. Execution operations additionally carry the selected `agentId`. Chat events include `sessionId`, `turnId`, and `agentId` so the renderer can route events without assuming one session per Agent.

All channels continue to use centralized `Channels` definitions. Renderer accesses the coordinator only through the typed preload `AgentApi`; no Electron primitive is exposed.

## Quota and Usage Attribution

Provider quota remains account-scoped and is projected from the currently selected Agent's exact provider/account/model assignment. Session totals aggregate every completed turn regardless of Agent. The persistent provider usage ledger records each successful turn against its immutable execution snapshot, preventing later Agent reconfiguration from changing attribution.

## Test Strategy

### Unit tests

- Idempotent legacy migration and project-scoped session listing.
- Agent fallback order and persistence of `lastAgentId`.
- Neutral context conversion across OpenAI, Gemini, and Claude/GPT transcripts.
- Removal of tool IDs, thought signatures, continuation handles, and incomplete tool calls.
- Session locking for running, prompt, queue, Stop, success, and failure paths.
- Immutable execution attribution after Agent rename, reconfiguration, deactivation, or deletion.
- Shared usage, todos, compact summary, and last-turn undo/redo selection.
- Exact provider/account/model usage-ledger attribution.

### Integration tests

- Agent A and Agent B execute sequential turns in one session and Agent B receives Agent A's neutralized history.
- Cross-provider tool output remains useful without replaying incompatible tool metadata.
- Reload restores the same session, transcript, and last selected Agent.
- Deleting the selected Agent preserves history and falls back deterministically.
- IPC rejects stale session/turn events and concurrent writes.

### Renderer tests

- Changing Agent does not remount or clear the feed.
- Picker disabled state and accessible reason match running/prompt/queue state.
- Historical `Agent · model` badges and tooltips use stored snapshots.
- Right-panel quota follows selected Agent while context footer remains session-wide.

### E2E acceptance

1. Create two native Agents using different provider/model assignments.
2. Send a turn with the first Agent.
3. Switch to the second Agent and confirm the first transcript remains.
4. Send a continuation and confirm exactly one `.chat-panel` and one session remain.
5. Switch back and verify both Agent-attributed responses remain visible.
6. Confirm switching is unavailable during execution and becomes available afterward or after Stop.
7. Reload the app and confirm session, transcript, attribution, and selected Agent persist.
8. Delete one participating Agent and confirm history remains and selection falls back to `bs`.

Final verification requires `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, and `git diff --check`.

## Acceptance Criteria

- One session can use multiple Agents sequentially without losing or changing its transcript.
- The selected Agent receives provider-neutral context from every prior completed turn in the session.
- No provider-specific tool metadata is replayed across providers.
- Agent switching is impossible while the session is running, prompting, or draining queued work.
- Every assistant turn remains attributable to the exact historical Agent and model.
- Removing an Agent preserves history and triggers deterministic fallback.
- Session navigation, todos, compaction, undo/redo, usage, and persistence operate at session scope.
- Quota follows the selected Agent; usage remains attributed to the exact execution account/model.
- Migration preserves every legacy session independently and is safe to rerun.
- PTY terminal behavior is unchanged.
