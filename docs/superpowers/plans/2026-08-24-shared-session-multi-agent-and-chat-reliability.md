# Shared Multi-Agent Session and Chat Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each project chat session continuous across sequential Agent switches, then compact the Agent settings UI into a table and restore reliable chat execution across every connected provider transport.

**Architecture:** Sessions become project-owned records with immutable per-turn execution snapshots, while a dedicated coordinator serializes turns and compiles provider-neutral context for the selected Agent. Renderer state is keyed by session rather than Agent. After that migration is proven, the Agents settings tab becomes a compact table, and provider runtimes are validated through a transport matrix that fixes OpenAI Responses serialization, Antigravity runtime routing, and SSE decoding at their source boundaries.

**Tech Stack:** Electron 41, React 19, TypeScript strict, AI SDK model messages, provider adapters, JSON persistence, Vitest, Testing Library, Playwright.

**Approved spec:** `docs/superpowers/specs/2026-08-24-shared-session-multi-agent-design.md`

---

## Execution constraints

1. Preserve the current dirty worktree. Stage and commit only the files named by the active task.
2. Work test-first for every behavior change: write the focused assertion, observe the expected failure, implement the smallest coherent change, and rerun the focused suite.
3. Main process remains the only authority for session persistence, execution locks, provider credentials, model routing, tool execution, and usage attribution.
4. Shared code must not import Node or Electron.
5. All IPC uses `Channels`; renderer accesses only the typed preload `AgentApi`.
6. Never persist credentials, authorization headers, raw provider responses, or vault content in sessions, test evidence, screenshots, or commits.
7. Never replay provider-specific tool-call IDs, Google thought signatures, continuation IDs, or raw provider options into a different provider.
8. Never silently replace a missing Agent/provider/account/model with the first option. Only the selected-Agent fallback itself may use `bs`, then the first native Agent.
9. One session permits one writer. Agent switching remains locked while running, prompting, or draining a queue.
10. Stop clears the session queue, resolves pending prompts, marks the turn stopped, and releases the session lock.
11. PTY terminal panes and processes are out of scope and must retain their current behavior.
12. End each task with focused tests, `npm run typecheck`, `git diff --check`, and a scoped commit.
13. Final completion requires `npm test`, `npm run build`, `npm run e2e`, and running-app checks for every connected provider without exposing secrets.

## File responsibility map

### Shared session contracts

- Modify `src/shared/types.ts`: add session schema version, turn execution snapshots, session/turn event scope, queue Agent binding, and project-scoped summaries.
- Modify `src/shared/ipc.ts`: replace Agent-owned session calls with project/session calls and exact selected-Agent execution arguments.
- Modify `src/shared/remote-types.ts`: carry session and turn routing in remote chat events.

### Main-process session architecture

- Modify `src/main/agent/session.ts`: versioned project-owned records, idempotent legacy migration, execution snapshot persistence, project list/latest/create, and session-wide usage/todos.
- Create `src/main/agent/neutral-context.ts`: provider-neutral transcript compiler.
- Create `src/main/agent/shared-session-coordinator.ts`: active session, selected Agent, exclusive lock, prompt, and Agent-bound queue state.
- Modify `src/main/bs-agent-manager.ts`: delegate session state to the coordinator, run turns by session plus selected Agent, attribute events/items/usage, and preserve undo/redo/compact behavior.
- Modify `src/main/agent/loop.ts`: propagate immutable session/turn execution scope through every event.
- Modify `src/main/agent/message.ts`: expose neutral conversion helpers without changing same-provider tool replay inside one uninterrupted runtime turn.
- Modify `src/main/agent/snapshot.ts`: associate filesystem undo/redo entries with session and turn.
- Modify `src/main/index.ts`: session-centric IPC handlers.
- Modify `src/main/remote/remote-commands.ts`: session-centric remote commands.
- Modify `src/main/remote/remote-manager.ts`: preserve session/turn event routing.

### Renderer shared session

- Modify `src/preload/index.ts`: implement the new typed session IPC arguments.
- Modify `src/renderer/src/App.tsx`: own active project session and selected Agent without keying chat state by Agent.
- Modify `src/renderer/src/components/PaneGrid.tsx`: pass shared-session state to the one native pane.
- Modify `src/renderer/src/components/Pane.tsx`: pass project/session/Agent selection and lock state.
- Modify `src/renderer/src/components/chat/ChatPanel.tsx`: load by session ID, retain transcript on Agent switch, route scoped events, and disable Agent switching while locked.
- Create `src/renderer/src/components/chat/chat-event-scope.ts`: pure stale-event routing guard.
- Modify `src/renderer/src/components/chat/SessionBar.tsx`: project-scoped session operations.
- Modify `src/renderer/src/components/chat/AgentPicker.tsx`: disabled state and accessible lock reason.
- Modify `src/renderer/src/components/RightPanelQuota.tsx`: selected-Agent quota plus shared-session metrics.
- Modify `src/renderer/src/components/chat/ContextFooter.tsx`: aggregate session totals.
- Modify `src/renderer/src/styles.css`: execution badges and locked picker state.

### Agent settings table — requested final addition 1

- Modify `src/renderer/src/components/settings/AgentsTab.tsx`: semantic compact table with one Agent per row.
- Create `src/renderer/src/components/settings/AgentPromptModal.tsx`: system-prompt editor opened by the Edit action.
- Modify `src/renderer/src/styles.css`: responsive table layout and icon action buttons.
- Create `tests/unit/agents-table.test.tsx`: row, dependent selector, prompt modal, save, and delete coverage.

### Provider chat reliability — requested final addition 2

- Create `src/main/agent/provider-stream.ts`: bounded response-body detection and SSE/JSON decoding shared by custom transports.
- Modify `src/main/agent/openai-responses.ts`: explicit Responses API item serialization and safe stream decoding.
- Modify `src/main/agent/antigravity-llm.ts`: robust Cloud Code SSE parsing and structured runtime errors.
- Modify `src/main/providers/adapters/antigravity.ts`: exact runtime model/project resolution and one stale-context recovery.
- Modify `src/main/connections/manager.ts`: retry only classified refreshable provider-runtime failures.
- Modify `src/main/providers/adapters/openai.ts`: preserve exact OpenAI OAuth/API runtime selection.
- Modify `src/main/providers/adapters/github-copilot.ts`: confirm runtime-token and model routing parity.
- Modify `src/main/providers/adapters/openai-compatible.ts`: validate generic SSE transport assumptions without applying OpenAI Responses shapes.
- Create `tests/fixtures/provider-chat-fixtures.ts`: sanitized OpenAI Responses, Cloud Code, Copilot/OpenAI-compatible, split SSE, mislabeled SSE, 404, and malformed-event fixtures.
- Create `tests/integration/provider-chat-matrix.test.ts`: one completed text turn and one tool round trip per registered connected transport type.
- Modify `tests/unit/openai-responses.test.ts`: Responses item serialization and mislabeled SSE regression.
- Modify `tests/unit/antigravity-runtime.test.ts`: exact project/runtime model, split SSE, 404 classification, and retry regression.
- Modify `tests/integration/provider-agent-chat.test.ts`: OAuth-to-chat checks through the canonical Agent/session path.
- Create `docs/evidence/2026-08-24-shared-session-provider-chat-verification.md`: automated and redacted live-account evidence.
- Modify `docs/changelog-0.25.7.md`: user-facing shared-session, Agent table, and chat reliability notes.

## Phase 1 — Shared contracts and migration

### Task 1: Add project-session and execution-snapshot contracts

**Files:**
- Modify: `src/shared/types.ts`
- Create: `tests/unit/shared-session-contract.test.ts`

- [ ] **Step 1: Write failing contract assertions**

Add compile/runtime assertions for project ownership, immutable execution attribution, scoped events, and Agent-bound queue messages without replacing live IPC signatures yet:

```ts
const execution: TurnExecutionSnapshot = {
  turnId: 'turn-1', agentId: 'reviewer', agentName: 'Reviewer',
  providerId: 'openai', accountId: 'acct-1', accountLabel: 'Pro',
  modelId: 'gpt-5.6-sol', modelLabel: 'GPT-5.6 SOL', speed: 'fast',
  startedAt: 1, status: 'running'
}
const summary: ProjectSessionSummary = {
  id: 'session-1', projectPath: 'C:/project', lastAgentId: 'reviewer',
  title: 'Review', messageCount: 2, createdAt: 1, updatedAt: 2
}
const event: ScopedChatEvent = {
  type: 'turn-started', projectPath: 'C:/project', sessionId: summary.id,
  turnId: execution.turnId, agentId: execution.agentId
}
expect(event.sessionId).toBe('session-1')
expect(({ id: 'q1', agentId: 'reviewer', text: 'continue' } satisfies SessionQueuedMessage).agentId).toBe('reviewer')
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/shared-session-contract.test.ts`

Expected: FAIL because `TurnExecutionSnapshot`, project-scoped summary fields, scoped events, and Agent-bound session queue messages do not exist.

- [ ] **Step 3: Add exact shared shapes**

Add:

```ts
export const CHAT_SESSION_SCHEMA_VERSION = 2 as const
export type TurnExecutionStatus = 'running' | 'completed' | 'stopped' | 'failed'
export interface TurnExecutionSnapshot {
  turnId: string; agentId: string; agentName: string; providerId?: string
  accountId?: string; accountLabel?: string; modelId?: string; modelLabel?: string
  speed: 'standard' | 'fast'; startedAt: number; completedAt?: number
  status: TurnExecutionStatus
}
export type ResolvedTurnExecutionSnapshot = TurnExecutionSnapshot &
  Required<Pick<TurnExecutionSnapshot, 'providerId' | 'modelId'>>
export interface ChatEventScope {
  projectPath: string; sessionId: string; agentId: string; turnId?: string
}
export type ScopedChatEvent = ChatEvent & ChatEventScope
export type SessionQueuedMessage = QueuedMessage & { agentId: string }
export type ProjectSessionSummary = Omit<SessionSummary, 'agentId'> & {
  projectPath: string; lastAgentId?: string
}
```

Extend `ChatMessage` with `turnId?: string` and `execution?: TurnExecutionSnapshot`; extend `ToolCallData` with the same optional migration fields. Keep legacy `SessionSummary` for Agent-only IPC during migration and use `ProjectSessionSummary` for every new project-owned API.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/shared-session-contract.test.ts`

Expected: PASS for the additive shared-session contracts.

Run: `npm run typecheck`

Expected: PASS because live IPC signatures remain compatible until the coordinated migration in Task 7.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit only the two task files with: `git commit -m "feat: define shared multi-agent sessions"`

### Task 2: Migrate SessionStore to versioned project ownership

**Files:**
- Modify: `src/main/agent/session.ts`
- Modify: `tests/unit/session-store.test.ts`
- Modify: `tests/unit/session-store-remove.test.ts`
- Create: `tests/unit/shared-session-migration.test.ts`

- [ ] **Step 1: Add RED migration and project-list tests**

Seed two legacy sessions owned by different Agents in the same project and one in another project. Assert no merge, stable IDs, preserved content/usage/todos/timestamps, and idempotency:

```ts
const first = new SessionStore(store)
expect(first.listProject('C:/project').map(s => s.id)).toEqual(['legacy-b', 'legacy-a'])
expect(first.get('legacy-a')).toMatchObject({
  schemaVersion: 2, projectPath: 'C:/project', lastAgentId: 'agent-a', legacyAgentId: 'agent-a'
})
const once = JSON.stringify(store.load())
new SessionStore(store).listProject('C:/project')
expect(JSON.stringify(store.load())).toBe(once)
```

Call `backfillLegacyExecution` with a resolver for one known Agent and assert its legacy assistant/tool items receive a snapshot. Return `null` for another Agent and assert provider/account/model metadata remains absent instead of receiving a default.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/session-store.test.ts tests/unit/session-store-remove.test.ts tests/unit/shared-session-migration.test.ts`

Expected: FAIL because sessions are filtered by `agentId` and have no schema migration.

- [ ] **Step 3: Implement atomic idempotent normalization**

Use a versioned raw shape and project methods:

```ts
export interface StoredSession {
  schemaVersion: typeof CHAT_SESSION_SCHEMA_VERSION
  id: string
  projectPath: string
  lastAgentId?: string
  legacyAgentId?: string
  title: string
  items: ChatTranscriptItem[]
  todos: TodoItem[]
  usage: UsageSummary
  createdAt: number
  updatedAt: number
}

listProject(projectPath: string): ProjectSessionSummary[]
latestProject(projectPath: string): StoredSession | null
createProject(projectPath: string, lastAgentId?: string): StoredSession
setLastAgent(id: string, agentId: string): void
backfillLegacyExecution(
  resolve: (agentId: string) => Omit<TurnExecutionSnapshot, 'turnId' | 'startedAt' | 'status'> | null
): void
```

Normalize project paths with the existing project-path convention before comparison. Save migrated data once only when the normalized serialized value differs from loaded data. Preserve `legacyAgentId`; never merge by title or timestamp. `backfillLegacyExecution` groups legacy items into deterministic turns and applies only metadata returned by the resolver; it is idempotent and leaves unknown fields absent. Retain `list(agentId)`, `latest(agentId)`, and `create(agentId, projectPath)` as compatibility wrappers that filter `legacyAgentId` so the pre-migration manager remains functional until Task 5 switches to the project methods.

- [ ] **Step 4: Run GREEN and regression tests**

Run: `npx vitest run tests/unit/session-store.test.ts tests/unit/session-store-remove.test.ts tests/unit/shared-session-migration.test.ts`

Expected: PASS, including a second migration run producing byte-equivalent data.

Run: `npm run typecheck`

Expected: PASS; SessionStore retains temporary legacy wrappers for the current manager until Task 5.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: migrate sessions to project ownership"`

### Task 3: Compile provider-neutral multi-Agent context

**Files:**
- Create: `src/main/agent/neutral-context.ts`
- Modify: `src/main/agent/message.ts`
- Create: `tests/unit/neutral-context.test.ts`

- [ ] **Step 1: Add RED cross-provider context fixtures**

Build a transcript containing OpenAI function calls, Google thought signatures, tool results, a stopped partial response, images, and a final user continuation. Assert only valid user/assistant content remains:

```ts
const messages = compileNeutralContext(items, { toolOutputMaxChars: 2_000 })
expect(JSON.stringify(messages)).not.toContain('thoughtSignature')
expect(JSON.stringify(messages)).not.toContain('call-openai-1')
expect(JSON.stringify(messages)).not.toContain('providerOptions')
expect(messages).toContainEqual(expect.objectContaining({ role: 'assistant' }))
expect(JSON.stringify(messages)).toContain('[Tool read · completed]')
expect(JSON.stringify(messages)).toContain('[Incomplete response from Reviewer]')
```

Assert incomplete tool calls are omitted, completed tool output is truncated by the existing `truncateToolOutput`, and images remain only on user content.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/neutral-context.test.ts tests/unit/agent-message.test.ts`

Expected: FAIL because only `toLlmMessages` exists and it replays provider-specific tool messages.

- [ ] **Step 3: Implement the pure compiler**

Export:

```ts
export interface NeutralContextOptions { toolOutputMaxChars: number }
export function compileNeutralContext(
  items: ChatTranscriptItem[],
  options: NeutralContextOptions
): ModelMessage[]
```

Group items by `turnId`. Emit user text/images normally. Emit assistant text as assistant content and append bounded text blocks such as:

```text
[Tool read · completed]
Input: {"file_path":"src/main/index.ts"}
Output: <bounded output>
```

Never emit AI SDK `tool-call` or `tool-result` parts from prior execution snapshots. Keep existing `toLlmMessages` for a tool loop within the active turn; do not route cross-Agent history through it.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/neutral-context.test.ts tests/unit/agent-message.test.ts`

Expected: PASS with provider-specific fields absent from serialized neutral context.

Run: `npm run typecheck`

Expected: no new errors from the compiler.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: compile provider-neutral session context"`

## Phase 2 — Session coordination and execution

### Task 4: Add exclusive SharedSessionCoordinator state

**Files:**
- Create: `src/main/agent/shared-session-coordinator.ts`
- Create: `tests/unit/shared-session-coordinator.test.ts`

- [ ] **Step 1: Add RED selection, lock, prompt, and queue tests**

Assert deterministic fallback and every lock condition:

```ts
expect(coordinator.resolveAgent('missing', agents)).toBe('bs-id')
expect(coordinator.selectAgent(project, session, 'reviewer-id')).toMatchObject({ lastAgentId: 'reviewer-id' })
const turn = coordinator.acquire(project, session, 'reviewer-id')
expect(() => coordinator.selectAgent(project, session, 'bs-id')).toThrow(/Agent locked while running/)
coordinator.setPrompt(turn.turnId, 'prompt-1')
coordinator.enqueue(session, { id: 'q1', agentId: 'reviewer-id', text: 'next' })
coordinator.stop(session)
expect(coordinator.state(session)).toMatchObject({ locked: false, queue: [], promptId: undefined })
```

Also assert a second acquire for the same session fails and another session may acquire independently.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/shared-session-coordinator.test.ts`

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement one-writer state transitions**

Provide:

```ts
interface SessionExecutionState {
  projectPath: string; sessionId: string; agentId: string; turnId: string
  locked: boolean; promptId?: string; queue: QueuedMessage[]
}
class SharedSessionCoordinator {
  resolveAgent(preferred: string | undefined, agents: AgentConfig[]): string | null
  selectAgent(projectPath: string, sessionId: string, agentId: string): ProjectSessionSummary
  acquire(projectPath: string, sessionId: string, agentId: string): SessionExecutionState
  enqueue(sessionId: string, message: QueuedMessage): void
  setPrompt(turnId: string, promptId?: string): void
  complete(sessionId: string): void
  fail(sessionId: string): void
  stop(sessionId: string): void
  state(sessionId: string): SessionExecutionState | null
}
```

`stop`, `fail`, and `complete` must resolve pending prompts and release locks; `stop` clears the queue, while `complete` keeps the lock until queue drain finishes.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/shared-session-coordinator.test.ts`

Expected: PASS for every state transition and fallback order.

Run: `npm run typecheck`

Expected: PASS for the isolated coordinator.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: coordinate shared session execution"`

### Task 5: Execute attributed turns through the shared session

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/agent/loop.ts`
- Modify: `src/main/agent/session.ts`
- Modify: `tests/unit/bs-agent-manager.test.ts`
- Create: `tests/integration/shared-session-agent-switch.test.ts`

- [ ] **Step 1: Add RED sequential-Agent integration**

Configure Agent A on OpenAI and Agent B on Antigravity fixture runtimes. Send sequential turns into one session:

```ts
const session = manager.createProjectSession(projectPath, 'agent-a')
await manager.sendInSession(projectPath, session.id, 'agent-a', 'inspect package')
manager.selectProjectSessionAgent(projectPath, session.id, 'agent-b')
await manager.sendInSession(projectPath, session.id, 'agent-b', 'continue the review')
const transcript = manager.listSessionTranscript(projectPath, session.id)
expect(transcript.filter(item => item.kind === 'message')).toHaveLength(4)
expect(transcript.at(-1)).toMatchObject({
  kind: 'message', message: { execution: { agentId: 'agent-b', providerId: 'antigravity' } }
})
expect(secondRuntimeRequest.messages).toEqual(expect.arrayContaining([
  expect.objectContaining({ role: 'assistant' })
]))
```

Assert the second request contains Agent A's text/tool outcome but no `tool-call`, `thoughtSignature`, or provider options.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/integration/shared-session-agent-switch.test.ts tests/unit/bs-agent-manager.test.ts`

Expected: FAIL because manager active sessions, runners, queues, and transcripts are keyed by Agent.

- [ ] **Step 3: Delegate session state and capture immutable execution**

Construct `SharedSessionCoordinator` in `BsAgentManager`. Replace `activeSessions: Map<agentId, sessionId>` with project/session coordinator calls. Add the session-native execution entry point while retaining the old Agent-only wrapper until renderer and remote migration:

```ts
async sendInSession(
  projectPath: string,
  sessionId: string,
  agentId: string,
  text: string,
  images?: ImageAttachment[],
  displayText?: string
): Promise<void>
```

Resolve the exact assignment before acquiring. Create one `ResolvedTurnExecutionSnapshot`, append the user message, pass `compileNeutralContext(session.items, limits)` to the selected runtime, and scope all emitted loop events with project/session/turn/Agent. Append assistant/tool items with the immutable snapshot. Persist `lastAgentId` only after valid selection.

During manager initialization, call `store.backfillLegacyExecution` after Agent configurations and exact assignments are loaded. Add `listProjectSessions`, `createProjectSession`, `switchProjectSession`, `deleteProjectSession`, `renameProjectSession`, `selectProjectSessionAgent`, `listSessionTranscript`, and `stopSessionChat` manager methods. Existing Agent-only methods delegate to the Agent's project and remain only as migration wrappers until all callers use the session-native methods.

- [ ] **Step 4: Run GREEN and manager regressions**

Run: `npx vitest run tests/integration/shared-session-agent-switch.test.ts tests/unit/bs-agent-manager.test.ts tests/unit/agent-loop.test.ts tests/integration/agent-stream-overlap.test.ts`

Expected: PASS; one session contains both Agents in deterministic turn order and overlapping deltas remain correctly scoped.

Run: `npm run typecheck`

Expected: PASS because new manager methods are additive and legacy wrappers remain temporarily available.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: run attributed turns in shared sessions"`

### Task 6: Make queue, prompts, Stop, failure, usage, and snapshots session-scoped

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/agent/snapshot.ts`
- Modify: `src/main/agent/session.ts`
- Modify: `tests/unit/bs-agent-manager.test.ts`
- Modify: `tests/unit/agent-snapshot.test.ts`
- Modify: `tests/unit/provider-usage-ledger.test.ts`

- [ ] **Step 1: Add RED lifecycle assertions**

Cover queue Agent binding, prompt lock, Stop cleanup, failed partial output, successful usage, and cross-Agent undo:

```ts
expect(manager.getSessionState(session.id)).toMatchObject({ locked: true, agentId: 'agent-a' })
await manager.sendInSession(project, session.id, 'agent-a', 'queued')
expect(manager.listSessionQueued(session.id)[0].agentId).toBe('agent-a')
manager.stopSessionChat(project, session.id)
expect(manager.listSessionQueued(session.id)).toEqual([])
expect(manager.getSessionState(session.id)?.locked).toBe(false)
expect(ledger.record).not.toHaveBeenCalledForTurn(failedTurnId)
expect(manager.undoSession(project, session.id)).toMatchObject({ agentId: 'agent-b', turnId: 'turn-b' })
```

Assert todos and compact summaries remain visible after selecting another Agent.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/bs-agent-manager.test.ts tests/unit/agent-snapshot.test.ts tests/unit/provider-usage-ledger.test.ts`

Expected: FAIL because lifecycle maps and filesystem snapshots are Agent-keyed.

- [ ] **Step 3: Move lifecycle keys to session/turn**

Key controllers, running state, queues, prompt ownership, redo stacks, todo state, compaction checks, and context usage by `sessionId`:

```ts
private controllers = new Map<string, AbortController>() // sessionId
private running = new Set<string>() // sessionId
private queues = new Map<string, SessionQueuedMessage[]>()
private redoStacks = new Map<string, Array<{ turnId: string; items: ChatTranscriptItem[] }>>()
```

Snapshot entries include `{ projectPath, sessionId, turnId, agentId }`. Undo selects the latest completed turn, restores its recorded snapshot, and truncates by `turnId`; redo restores transcript items and filesystem snapshot without a provider request.

Expose session-native manager queries/actions used by IPC and tests:

```ts
getSessionState(sessionId: string): SessionExecutionState | null
listSessionQueued(sessionId: string): SessionQueuedMessage[]
undoSession(projectPath: string, sessionId: string): { agentId: string; turnId: string } | null
redoSession(projectPath: string, sessionId: string): { agentId: string; turnId: string } | null
```

On success, aggregate session usage and call the provider usage ledger with the immutable execution provider/account/model. On stopped/failed turns, mark status and retain partial assistant text but do not increment completed session usage or the successful request ledger.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/bs-agent-manager.test.ts tests/unit/agent-snapshot.test.ts tests/unit/provider-usage-ledger.test.ts tests/unit/agent-compact.test.ts`

Expected: PASS across Agent switch, Stop, queue, prompt, undo/redo, todos, compaction, and usage cases.

Run: `npm run typecheck`

Expected: no main-process session lifecycle errors.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "refactor: scope chat lifecycle by session"`

## Phase 3 — IPC, remote, and renderer migration

### Task 7: Route project/session/turn through IPC and remote control

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/remote-types.ts`
- Modify: `src/main/remote/remote-commands.ts`
- Modify: `src/main/remote/remote-manager.ts`
- Modify: `tests/unit/ipc-contract.test.ts`
- Modify: `tests/unit/remote-commands.test.ts`
- Modify: `tests/unit/remote-manager.test.ts`

- [ ] **Step 1: Add RED handler argument and event-scope tests**

Assert exact calls:

```ts
await api.sendSessionChat(project, 'session-1', 'agent-b', 'continue')
expect(ipc.invoke).toHaveBeenCalledWith(
  Channels.ChatSend, project, 'session-1', 'agent-b', 'continue', undefined
)
expect(remote.bsAgent.switchProjectSession).toHaveBeenCalledWith(project, 'session-1')
expect(remoteEvent).toMatchObject({
  type: 'chat:event', event: { sessionId: 'session-1', turnId: 'turn-1', agentId: 'agent-b' }
})
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/ipc-contract.test.ts tests/unit/remote-commands.test.ts tests/unit/remote-manager.test.ts`

Expected: FAIL because handlers still accept Agent-only arguments.

- [ ] **Step 3: Implement session-centric handlers**

Add these session-native `AgentApi` methods while retaining legacy Agent-only methods for one migration release:

```ts
listProjectSessions(projectPath: string): Promise<ProjectSessionSummary[]>
createProjectSession(projectPath: string, agentId?: string): Promise<ProjectSessionSummary>
switchProjectSession(projectPath: string, sessionId: string): Promise<ProjectSessionSummary | null>
deleteProjectSession(projectPath: string, sessionId: string): Promise<ProjectSessionSummary>
renameProjectSession(projectPath: string, sessionId: string, title: string): Promise<ProjectSessionSummary | null>
selectProjectSessionAgent(projectPath: string, sessionId: string, agentId: string): Promise<ProjectSessionSummary>
sendSessionChat(projectPath: string, sessionId: string, agentId: string, text: string, images?: ImageAttachment[]): Promise<void>
stopSessionChat(projectPath: string, sessionId: string): Promise<void>
listSessionTranscript(projectPath: string, sessionId: string): Promise<ChatTranscriptItem[]>
```

Add corresponding centralized channels including `SessionSelectAgent`. Route them to the session-native manager methods from Task 5. Remote session commands take project/session IDs, preserve event scope, and reject a session that does not belong to the requested project. Legacy preload methods remain callable only for backward compatibility and are not used by the renderer after Task 8.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/ipc-contract.test.ts tests/unit/remote-commands.test.ts tests/unit/remote-manager.test.ts`

Expected: PASS with centralized channels and exact session-native arguments.

Run: `npm run typecheck`

Expected: PASS because the session-native API is additive during migration.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "refactor: route chat IPC by session"`

### Task 8: Keep ChatPanel mounted while switching Agents

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/PaneGrid.tsx`
- Modify: `src/renderer/src/components/Pane.tsx`
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Modify: `src/renderer/src/components/chat/SessionBar.tsx`
- Modify: `src/renderer/src/components/chat/AgentPicker.tsx`
- Create: `src/renderer/src/components/chat/chat-event-scope.ts`
- Modify: `tests/unit/shared-chat-selection.test.ts`
- Create: `tests/unit/shared-session-chat-panel.test.tsx`
- Create: `tests/unit/chat-event-scope.test.ts`

- [ ] **Step 1: Add RED renderer state and routing tests**

Render one ChatPanel, load one project session, then select another Agent:

```tsx
expect(screen.getByText('first agent answer')).toBeVisible()
await user.click(screen.getByRole('button', { name: /Agent/ }))
await user.click(screen.getByRole('option', { name: /Reviewer/ }))
expect(screen.getByText('first agent answer')).toBeVisible()
expect(api.listChatTranscript).toHaveBeenCalledTimes(1)
expect(screen.getAllByTestId('chat-panel')).toHaveLength(1)
```

Assert picker disabled reason for running/prompt/queue and pure routing:

```ts
expect(acceptChatEvent(active, { ...event, sessionId: 'other' })).toBe(false)
expect(acceptChatEvent(active, { ...event, sessionId: active.sessionId, turnId: active.turnId })).toBe(true)
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/shared-chat-selection.test.ts tests/unit/shared-session-chat-panel.test.tsx tests/unit/chat-event-scope.test.ts`

Expected: FAIL because `ChatPanel` reloads on `agentId` and events lack session scope.

- [ ] **Step 3: Key UI state by session ID**

App owns `{ projectPath, sessionId, selectedAgentId }`. Pass the session ID through the one native pane. Change ChatPanel loaders and actions to use project/session signatures. Its transcript effect depends on `[projectPath, sessionId]`, not `agentId`; Agent-specific variant/context/quota effects may depend on selected Agent.

Implement:

```ts
export function acceptChatEvent(
  active: { projectPath: string; sessionId: string; turnId?: string },
  event: ChatEvent
): boolean {
  if (event.projectPath !== active.projectPath || event.sessionId !== active.sessionId) return false
  return !active.turnId || !event.turnId || event.turnId === active.turnId
}
```

Disable AgentPicker when `running || pendingPrompt !== null || queue.length > 0`, set `aria-disabled`, and expose `Agent locked while running` through `aria-describedby` and tooltip. A valid selection calls `selectSessionAgent` and updates the selected Agent without resetting feed, scroll, todos, title, or session totals.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/shared-chat-selection.test.ts tests/unit/shared-session-chat-panel.test.tsx tests/unit/chat-event-scope.test.ts`

Expected: PASS with one transcript load and one chat frame through Agent changes.

Run: `npm run typecheck`

Expected: PASS across main, preload, renderer, extension, and server.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: switch Agents inside one chat session"`

### Task 9: Render immutable turn attribution and correct quota/session totals

**Files:**
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `src/renderer/src/components/chat/ContextFooter.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `tests/unit/quota-snapshot.test.tsx`
- Create: `tests/unit/chat-turn-attribution.test.tsx`

- [ ] **Step 1: Add RED badge, tooltip, and quota assertions**

Render historical turns with stored execution snapshots, rename/delete the current Agent configuration, and assert history remains unchanged:

```tsx
expect(screen.getByText('Reviewer · GPT-5.6 SOL')).toBeVisible()
await user.hover(screen.getByText('Reviewer · GPT-5.6 SOL'))
expect(screen.getByRole('tooltip')).toHaveTextContent('OpenAI · pro@example.com')
expect(screen.getByTestId('context-session-tokens')).toHaveTextContent('1,250')
expect(screen.getByTestId('quota-selected-agent')).toHaveTextContent('Gemini 3.1 Pro')
```

Assert switching selected Agent changes quota family but not aggregate footer values or historical badges.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/chat-turn-attribution.test.tsx tests/unit/quota-snapshot.test.tsx`

Expected: FAIL because feed items discard execution snapshots and metrics are Agent-scoped.

- [ ] **Step 3: Implement compact immutable attribution UI**

Carry execution snapshots into `FeedItem` and render:

```tsx
{role === 'assistant' && execution && (
  <span
    className="chat-turn-agent-badge"
    title={`${execution.providerId ?? 'Provider not reported'} · ${execution.accountLabel ?? execution.accountId ?? 'Account not reported'}`}
  >
    {execution.agentName} · {execution.modelLabel ?? execution.modelId ?? 'Model not reported'}
  </span>
)}
```

Use stored `agentName` and `modelLabel ?? modelId`; never look up current Agent configuration for historical labels. Use session usage returned by the session API for ContextFooter. Keep RightPanelQuota projected from the currently selected Agent's exact account/model assignment.

- [ ] **Step 4: Run GREEN, visual regression, and typecheck**

Run: `npx vitest run tests/unit/chat-turn-attribution.test.tsx tests/unit/quota-snapshot.test.tsx tests/unit/quota-view.test.ts`

Expected: PASS with attribution unchanged after Agent deletion and quota switching independently from session totals.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: show Agent attribution per chat turn"`

## Phase 4 — Shared-session integrated acceptance

### Task 10: Prove migration, reload, fallback, compact, undo, and one-frame E2E

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`
- Create: `tests/integration/shared-session-restart.test.ts`
- Modify: `tests/unit/agent-trace-manager.test.ts`
- Modify: `tests/unit/workspace-agent-reconcile.test.ts`

- [ ] **Step 1: Add RED restart and E2E scenarios**

The integration test persists a legacy Agent-owned session, initializes the manager twice, switches Agents, and asserts stable migration and attribution. E2E must:

```ts
await expect(window.locator('.chat-panel')).toHaveCount(1)
await sendWithAgent(window, 'bs', 'first')
await selectAgent(window, 'reviewer')
await expect(window.locator('.chat-msg.assistant')).toContainText('first answer')
await sendWithAgent(window, 'reviewer', 'continue')
await expect(window.locator('.chat-turn-agent-badge')).toHaveText(['bs · Fixture', 'reviewer · Fixture'])
await expect(window.locator('.agent-picker-trigger')).toBeDisabled()
await stopTurn(window)
await expect(window.locator('.agent-picker-trigger')).toBeEnabled()
```

Reload, delete `reviewer`, and assert the same transcript remains with active selection `bs`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/integration/shared-session-restart.test.ts tests/unit/agent-trace-manager.test.ts tests/unit/workspace-agent-reconcile.test.ts`

Expected: FAIL because Agent removal still purges Agent-owned sessions/traces, trace lookup still assumes Agent ownership, or the active session selection is not restored by project.

- [ ] **Step 3: Complete the exact integration wiring**

Change Agent removal to delete only Agent runtime/config/assignment state:

```ts
removeAgent(agentId: string): void {
  this.stopExecutionsForAgent(agentId)
  this.runners.delete(agentId)
  this.agents.delete(agentId)
  this.resolved.delete(agentId)
  this.assignments.remove(agentId)
  this.coordinator.reconcileAgents([...this.agents.values()])
}
```

Do not call `SessionStore.deleteForAgent`; retain all project sessions. Key trace creation/lookup/deletion by `sessionId` and `turnId`, retaining `agentId` as attribution only. On workspace reconciliation, pass the current native Agent list into `SharedSessionCoordinator`; if `lastAgentId` disappears, call the defined `bs`/first/null fallback and persist it. Restore active session by project before resolving Agent selection. Keep compact and undo/redo stores addressed by session/turn so an Agent switch changes neither.

- [ ] **Step 4: Run GREEN, build, and E2E**

Run: `npx vitest run tests/integration/shared-session-restart.test.ts tests/unit/agent-trace-manager.test.ts tests/unit/workspace-agent-reconcile.test.ts tests/unit/shared-session-chat-panel.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run e2e`

Expected: all Playwright tests PASS, including shared history, lock, reload, deletion fallback, and exactly one `.chat-panel`.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "test: verify shared multi-agent sessions"`

## Phase 5 — Requested final addition 1: compact Agent settings table

### Task 11: Convert Settings → Agents into one-row-per-Agent table

**Files:**
- Modify: `src/renderer/src/components/settings/AgentsTab.tsx`
- Create: `src/renderer/src/components/settings/AgentPromptModal.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `tests/unit/agents-table.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add RED semantic table and prompt-privacy tests**

Assert visible columns and that system prompts never appear in the table:

```tsx
expect(screen.getByRole('columnheader', { name: 'Name' })).toBeVisible()
expect(screen.getByRole('columnheader', { name: 'Provider' })).toBeVisible()
expect(screen.getByRole('columnheader', { name: 'Account' })).toBeVisible()
expect(screen.getByRole('columnheader', { name: 'Model' })).toBeVisible()
expect(screen.getByRole('columnheader', { name: 'Mode' })).toBeVisible()
expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
expect(screen.queryByText('private system instruction')).not.toBeInTheDocument()
expect(screen.getAllByRole('row')).toHaveLength(agents.length + 1)
```

Click the row Edit icon, verify `AgentPromptModal` contains the prompt, edit/save it, and assert `onChangeAgents` receives the exact Agent with provider/account/model/speed preserved. Verify Delete is disabled for `bs` and removes only the selected non-default Agent. Assert dependent selectors clear account/model when provider changes and clear model when account changes to an incompatible catalog.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/agents-table.test.tsx tests/unit/renderer-agent-assignment.test.tsx`

Expected: FAIL because AgentsTab renders stacked cards and visible textareas.

- [ ] **Step 3: Implement semantic compact table and prompt modal**

Render:

```tsx
<table className="agents-table">
  <thead><tr>
    <th>Name</th><th>Provider</th><th>Account</th><th>Model</th><th>Mode</th>
    <th className="agents-actions-heading"><span className="sr-only">Actions</span></th>
  </tr></thead>
  <tbody>{visibleAgents.map(agent => <AgentRow key={agent.name} agent={agent} />)}</tbody>
</table>
```

Each Agent occupies exactly one row. Name is plain text; provider/account/model/mode remain compact controlled selects. The unlabeled visual action column contains icon buttons with accessible names `Edit <name>` and `Delete <name>`. Edit opens `AgentPromptModal`; the prompt is absent from table DOM while the modal is closed. Keep Add Agent as a button/modal. Keep sub-agent role assignments in a separate section below the Agent table rather than mixing them into Agent rows.

Use a bounded horizontal container only below the minimum settings width; at the default dialog width all six columns fit without horizontal scrolling. Do not hide any requested Agent field.

- [ ] **Step 4: Run GREEN, build, and E2E**

Run: `npx vitest run tests/unit/agents-table.test.tsx tests/unit/renderer-agent-assignment.test.tsx tests/unit/agents-provider-accounts.test.ts`

Expected: PASS for exact persistence and prompt visibility.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

Run: `npm run e2e`

Expected: Settings Agents displays one row per Agent, edit modal saves the prompt, deleting an Agent reconciles the chat picker, and the default dialog has no horizontal overflow.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: render Agent settings as a compact table"`

## Phase 6 — Requested final addition 2: provider chat diagnostics and remediation

### Task 12: Build a provider transport chat matrix that reproduces the reported failures

**Files:**
- Create: `tests/fixtures/provider-chat-fixtures.ts`
- Create: `tests/integration/provider-chat-matrix.test.ts`
- Modify: `tests/integration/provider-agent-chat.test.ts`
- Modify: `tests/unit/openai-responses.test.ts`
- Modify: `tests/unit/antigravity-runtime.test.ts`

- [ ] **Step 1: Encode the three screenshot failures as sanitized RED fixtures**

Create exact fixtures:

```ts
export const OPENAI_TOOL_CALL_400 = {
  error: { message: "Invalid value: 'tool-call'. Supported values are: 'input_text', 'input_image', 'input_audio', 'output_text', 'refusal', 'input_file', 'computer_screenshot', 'summary_text', and 'encrypted_content'." }
}
export const ANTIGRAVITY_ENTITY_404 = {
  error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' }
}
export const MISLABELED_SSE = 'event: response.created\ndata: {"type":"response.created","response":{"id":"r1"}}\n\nevent: response.completed\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n'
```

Add split-chunk SSE, CRLF, comments/keep-alive, `[DONE]`, malformed single event, OpenAI function call/output, Cloud Code Gemini text/tool, Cloud Code Claude/GPT text, Copilot token runtime, and generic OpenAI-compatible fixtures. All fixture identities are fake and contain no real provider payload from the user's account.

- [ ] **Step 2: Add the transport matrix RED test**

Table-drive these transports:

```ts
const cases = [
  ['openai-api', createOpenAiApiRuntime],
  ['openai-oauth', createOpenAiOAuthRuntime],
  ['github-copilot-oauth', createCopilotRuntime],
  ['antigravity-gemini', createAntigravityGeminiRuntime],
  ['antigravity-claude-gpt', createAntigravityThirdPartyRuntime],
  ['openai-compatible', createCompatibleRuntime]
] as const
```

For every case, assert one text turn completes, a tool call/result can continue, the requested persisted model resolves to the exact runtime model ID, and errors are returned as structured `LlmStreamPart` errors rather than uncaught `SyntaxError`.

- [ ] **Step 3: Run RED and record root-cause boundaries**

Run: `npx vitest run tests/integration/provider-chat-matrix.test.ts tests/unit/openai-responses.test.ts tests/unit/antigravity-runtime.test.ts tests/integration/provider-agent-chat.test.ts`

Expected failures:

- OpenAI raw AI SDK `tool-call` content reaches Responses input.
- A response body beginning with `event:` reaches `response.json()` and throws `SyntaxError`.
- Antigravity stale/mismatched project or runtime model returns a terminal 404 with no classified recovery.

Do not modify implementation in this step. Save the exact failing assertions in the test output/evidence notes.

- [ ] **Step 4: Confirm the matrix covers every ready adapter class**

Compare `ProviderRegistry.listReady()` and the registrations in `src/main/index.ts` against the matrix. Individual Cursor/Windsurf/Kiro/Grok/CodeBuddy/Qoder/Trae/Zed/ZCode entries share the OpenAI-compatible transport contract; add a descriptor assertion that every ready registered provider maps to one tested transport class. Fail if a future adapter is registered without a chat contract case.

- [ ] **Step 5: Review and commit RED fixtures/tests only**

Run: `git diff --check`

Commit only fixture and test changes with: `git commit -m "test: reproduce provider chat transport failures"`

### Task 13: Serialize OpenAI Responses input items and decode SSE safely

**Files:**
- Create: `src/main/agent/provider-stream.ts`
- Modify: `src/main/agent/openai-responses.ts`
- Modify: `tests/unit/openai-responses.test.ts`
- Modify: `tests/integration/provider-chat-matrix.test.ts`

- [ ] **Step 1: Tighten RED serialization assertions**

Assert the request contains only Responses API item/content types:

```ts
expect(body.input).toEqual([
  { role: 'user', content: [{ type: 'input_text', text: 'inspect' }] },
  { role: 'assistant', content: [{ type: 'output_text', text: 'reading' }] },
  { type: 'function_call', call_id: 'call-1', name: 'read', arguments: '{"file_path":"a.ts"}' },
  { type: 'function_call_output', call_id: 'call-1', output: 'contents' }
])
expect(JSON.stringify(body.input)).not.toContain('"type":"tool-call"')
expect(JSON.stringify(body.input)).not.toContain('"type":"tool-result"')
```

Assert `text/event-stream`, `application/json`, and mislabeled `text/plain` beginning with `event:`/`data:` all decode without `SyntaxError`, and malformed individual SSE events yield a structured error while later complete events still parse.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/openai-responses.test.ts tests/integration/provider-chat-matrix.test.ts -t "OpenAI"`

Expected: FAIL on raw content part types and mislabeled SSE parsing.

- [ ] **Step 3: Implement explicit Responses conversion and shared decoder**

Export pure helpers:

```ts
export function toResponsesInput(messages: ModelMessage[]): ResponsesInputItem[]
export async function* decodeProviderResponse(
  response: Response,
  options: { maxBytes: number }
): AsyncGenerator<{ kind: 'event'; event: Record<string, unknown> } | { kind: 'json'; value: Record<string, unknown> } | { kind: 'parse-error'; message: string }>
```

Map user text/images to `input_text`/`input_image`, assistant text to `output_text`, tool calls to top-level `function_call`, and tool results to `function_call_output`. Normalize function arguments to JSON objects before stringifying once. Use the same conversion for `/responses` and `/responses/compact`.

The decoder must inspect content type and the first bounded non-whitespace bytes, parse SSE frames across arbitrary chunk boundaries, ignore comment/keep-alive frames, accept optional `event:` lines, parse each `data:` JSON payload independently, cap buffered bytes, and never call `response.json()` on SSE text.

- [ ] **Step 4: Run GREEN and OpenAI integration**

Run: `npx vitest run tests/unit/openai-responses.test.ts tests/integration/provider-chat-matrix.test.ts -t "OpenAI"`

Expected: PASS with no `tool-call` content type in outgoing JSON and no uncaught SSE `SyntaxError`.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: normalize OpenAI Responses chat transport"`

### Task 14: Recover Antigravity runtime context and parse Cloud Code streams

**Files:**
- Modify: `src/main/agent/antigravity-llm.ts`
- Modify: `src/main/providers/adapters/antigravity.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `tests/unit/antigravity-runtime.test.ts`
- Modify: `tests/integration/provider-chat-matrix.test.ts`
- Modify: `tests/integration/provider-agent-chat.test.ts`

- [ ] **Step 1: Add RED exact-route and one-recovery assertions**

Seed a persisted friendly model ID whose discovered `runtimeId` differs, an expired project ID that returns `ANTIGRAVITY_ENTITY_404`, and a refreshed context/model catalog that succeeds:

```ts
expect(firstRequest).toMatchObject({ project: 'stale-project', model: 'MODEL_OLD' })
expect(loadCodeAssist).toHaveBeenCalledTimes(1)
expect(fetchAvailableModels).toHaveBeenCalledTimes(1)
expect(secondRequest).toMatchObject({ project: 'fresh-project', model: 'MODEL_FRESH' })
expect(parts).toContainEqual({ kind: 'text', text: 'recovered' })
expect(streamGenerateContent).toHaveBeenCalledTimes(2)
```

Assert a second 404 stops without a retry loop and reports provider/account/model plus a redacted remediation message. Test Gemini and Claude/GPT discovered runtime IDs separately. Add split SSE and malformed-event cases to prove valid later frames still complete.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/antigravity-runtime.test.ts tests/integration/provider-chat-matrix.test.ts -t "Antigravity|Cloud Code" tests/integration/provider-agent-chat.test.ts`

Expected: FAIL because runtime context is captured once, 404 is unclassified, and the local SSE parser silently discards malformed frames without structured diagnostics.

- [ ] **Step 3: Implement exact routing and bounded recovery**

Use `ProviderModel.runtimeId` from the exact selected account model. Add a structured runtime error code:

```ts
type ProviderRuntimeErrorCode =
  | 'auth-expired' | 'quota-exhausted' | 'capacity-exhausted'
  | 'runtime-entity-not-found' | 'stream-invalid' | 'request-failed'
```

On Antigravity 404 `NOT_FOUND`, ProviderManager performs one recovery only: force credential/context refresh, rerun `loadCodeAssist`, refresh the exact account model catalog, resolve the same persisted model ID to its new `runtimeId`, rebuild the runtime, and retry once. Do not fallback to another model. Preserve the selected Gemini versus Claude/GPT family.

Route Cloud Code response bodies through `decodeProviderResponse`; parse nested `response` envelopes, usage metadata, Gemini thought signatures for the active same-provider tool turn, and text/tool output for third-party Claude/GPT models. Emit a structured parse error for malformed frames without throwing raw `SyntaxError`.

- [ ] **Step 4: Run GREEN and Antigravity integration**

Run: `npx vitest run tests/unit/antigravity-runtime.test.ts tests/unit/antigravity-runtime-guard.test.ts tests/integration/provider-chat-matrix.test.ts -t "Antigravity|Cloud Code" tests/integration/provider-agent-chat.test.ts`

Expected: PASS for exact project/runtime model routing, one 404 recovery, Gemini and Claude/GPT text/tool turns, and split/mislabeled SSE.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: recover Antigravity chat runtime routing"`

### Task 15: Verify Copilot and OpenAI-compatible adapters through canonical Agent chat

**Files:**
- Modify: `src/shared/providers.ts`
- Modify: `src/main/providers/registry.ts`
- Modify: `src/main/providers/adapters/openai.ts`
- Modify: `src/main/providers/adapters/antigravity.ts`
- Modify: `src/main/providers/adapters/github-copilot.ts`
- Modify: `src/main/providers/adapters/openai-compatible.ts`
- Modify: `tests/integration/provider-chat-matrix.test.ts`
- Modify: `tests/integration/provider-github-copilot.test.ts`
- Modify: `tests/unit/provider-github-copilot.test.ts`
- Modify: `tests/unit/providers-registry.test.ts`

- [ ] **Step 1: Add RED canonical-path assertions**

For GitHub Copilot, expire the runtime token, assert one token refresh, exact model preservation, and a completed tool round trip. For every OpenAI-compatible descriptor, assert its exact base URL/auth header/model flows through shared Agent session chat and never uses OpenAI Responses-only item types.

```ts
expect(copilotTokenExchange).toHaveBeenCalledTimes(1)
expect(copilotRequest.model).toBe('claude-sonnet-4.6')
expect(compatibleRequest.model).toBe(savedAssignment.modelId)
expect(JSON.stringify(compatibleRequest)).not.toContain('function_call_output')
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/integration/provider-chat-matrix.test.ts tests/integration/provider-github-copilot.test.ts tests/unit/provider-github-copilot.test.ts tests/unit/providers-registry.test.ts`

Expected: any untested or incorrectly routed registered adapter fails with its provider ID and transport class.

- [ ] **Step 3: Declare and enforce the exact transport class**

Add the required capability field:

```ts
export type ProviderChatTransport = 'openai-responses' | 'openai-compatible' | 'cloud-code'
export interface ProviderCapability {
  // existing fields
  chatTransport: ProviderChatTransport
}
```

Declare OpenAI as `openai-responses`, Antigravity as `cloud-code`, and GitHub Copilot plus every compatible descriptor as `openai-compatible`. Make `ProviderRegistry.register` reject a ready/experimental adapter without a declared transport. The matrix maps each registered provider ID to its declared transport and fails when that transport has no text/tool contract fixture.

Keep Copilot runtime-token renewal within its adapter; add a `copilotRuntimeCredential(secret)` boundary that returns `secret.apiKey ?? secret.accessToken` and throws `[bs] GitHub Copilot runtime token unavailable` when neither exists. Pass the exact selected `opts.model` through the existing compatible runtime. Do not send Responses API `function_call_output` items or Cloud Code envelopes to compatible endpoints.

- [ ] **Step 4: Run GREEN and complete provider matrix**

Run: `npx vitest run tests/integration/provider-chat-matrix.test.ts tests/integration/provider-github-copilot.test.ts tests/unit/provider-github-copilot.test.ts tests/unit/providers-registry.test.ts tests/integration/provider-agent-chat.test.ts`

Expected: every ready adapter ID maps to a passing chat transport contract; OpenAI API/OAuth, Copilot OAuth, Antigravity Gemini, Antigravity Claude/GPT, and OpenAI-compatible transports each complete text and tool turns.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "test: enforce provider chat transport parity"`

### Task 16: Run live connected-service checks and final release gates

**Files:**
- Create: `docs/evidence/2026-08-24-shared-session-provider-chat-verification.md`
- Modify: `docs/changelog-0.25.7.md`

- [ ] **Step 1: Run focused acceptance suites together**

Run:

```powershell
npx vitest run tests/unit/shared-session-contract.test.ts tests/unit/shared-session-migration.test.ts tests/unit/neutral-context.test.ts tests/unit/shared-session-coordinator.test.ts tests/integration/shared-session-agent-switch.test.ts tests/integration/shared-session-restart.test.ts tests/unit/shared-session-chat-panel.test.tsx tests/unit/chat-turn-attribution.test.tsx tests/unit/agents-table.test.tsx tests/unit/openai-responses.test.ts tests/unit/antigravity-runtime.test.ts tests/integration/provider-chat-matrix.test.ts tests/integration/provider-agent-chat.test.ts
```

Expected: every listed file PASS with no skipped new acceptance test.

- [ ] **Step 2: Run mandatory automated gates**

Run sequentially:

```powershell
npm run typecheck
npm test
npm run build
npm run e2e
git diff --check
```

Expected: typecheck PASS, all Vitest files/tests PASS, production build PASS, every Playwright test PASS, and no whitespace errors.

- [ ] **Step 3: Run the rebuilt app and verify every connected service**

Run: `npm run dev`

For each active account visible in the user's Provider settings, create or select an Agent bound to that exact account/model and send a harmless text-only prompt followed by a read-only tool prompt. Record only redacted account labels and outcomes:

- OpenAI API-key account: text and tool continuation complete; no `tool-call` 400.
- OpenAI ChatGPT OAuth account: Responses SSE completes; no API-key warning and no raw `SyntaxError`.
- GitHub Copilot OAuth account: runtime token refreshes when required and exact model completes.
- Antigravity Gemini model: exact project/runtime model completes text and tool continuation.
- Antigravity Claude/GPT family model: exact discovered runtime ID completes; no `Requested entity was not found` after one allowed context recovery.
- Every connected Cursor/Windsurf/Kiro/Grok/CodeBuddy/Qoder/Trae/Zed/ZCode account: exact model completes through its OpenAI-compatible transport.

If a provider is not connected, record `NOT CONNECTED — manual verification unavailable`; do not claim pass. If upstream metadata is absent, record `Not reported by provider`. Never paste tokens, authorization URLs, request bodies, or raw account payloads.

Also verify one session switches between two live Agents sequentially, transcript/context persists, picker locks during execution, Settings Agents uses one row per Agent, system prompt appears only in the Edit modal, and deleting a participating Agent preserves historical badges.

- [ ] **Step 4: Write evidence and changelog**

Evidence must include date/time, branch/commit, automated counts, Electron window size, provider/transport labels with secrets redacted, exact pass/fail/pending state for each active/absent provider, the three original regression messages and their passing replacement assertions, shared-session observations, Agent table observations, and absolute local screenshot paths when screenshots are captured.

Update the changelog in English following `docs/changelog-format.md` with concise user-facing bullets for shared multi-Agent sessions, immutable Agent/model badges, locked switching while running, compact Agent table/prompt modal, OpenAI Responses tool continuation, Antigravity runtime recovery, and provider chat parity.

- [ ] **Step 5: Final staged audit and scoped documentation commit**

Run:

```powershell
git status --short
git diff --stat
git diff --check
git diff --cached --name-only
```

Confirm no vault, token, `accounts.json`, `usage-ledger.json`, raw provider payload, authorization link, temporary screenshot outside evidence, or unrelated dirty file is staged.

Commit only evidence/changelog and any Task 16 test-only correction with:

```powershell
git add -- docs/evidence/2026-08-24-shared-session-provider-chat-verification.md docs/changelog-0.25.7.md
git commit -m "docs: verify shared sessions and provider chat"
```

## Acceptance mapping

| Requirement | Implemented and proved by |
| --- | --- |
| One project session switches Agents without losing transcript/context | Tasks 2, 5, 8, 10 |
| New Agent receives provider-neutral prior history | Tasks 3, 5 |
| No cross-provider tool metadata replay | Tasks 3, 13–14 |
| Agent picker locked during running/prompt/queue | Tasks 4, 6, 8, 10 |
| Historical `Agent · model` attribution survives config/delete | Tasks 1, 5, 9–10 |
| Deleted selected Agent falls back to `bs` and keeps history | Tasks 4, 8, 10 |
| Session-wide undo/redo/todos/compact/usage | Tasks 6, 9–10 |
| Legacy sessions migrate independently and idempotently | Tasks 2, 10 |
| Settings Agents is one-row-per-Agent table | Task 11 |
| System prompt hidden until Edit action | Task 11 |
| OpenAI `tool-call` 400 eliminated at serializer boundary | Tasks 12–13 |
| Mislabeled SSE no longer throws raw `SyntaxError` | Tasks 12–14 |
| Antigravity 404 recovers exact project/runtime model once | Tasks 12, 14 |
| Every ready/connected provider transport completes chat | Tasks 12–16 |
| PTY terminal behavior unchanged | Regression suites in Tasks 8, 10, 16 |

## Definition of complete

This plan is complete only when all task checkboxes are checked; every RED failure and GREEN pass is recorded; migration is idempotent; one session switches live Agents without losing context; switching remains locked during execution; Settings Agents renders one compact row per Agent with prompts hidden outside the modal; all registered ready provider IDs map to a tested chat transport; every connected provider has a redacted live result; all mandatory gates pass; and the evidence note contains no unresolved failed acceptance row or fabricated provider result.
