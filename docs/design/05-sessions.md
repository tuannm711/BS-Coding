# Sessions

What the agent remembers between turns, how several agents share one
conversation, and how a turn's file changes are undone. The turn loop that
produces these records is in `docs/design/02-agent-runtime.md`.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 17-28 | `src/main/agent/session.ts`, `SessionStore`, `sessions.json`, `src/main/agent/shared-session-coordinator.ts`, `SharedSessionCoordinator`, `src/main/agent/snapshot.ts` |
| [Data flow](#data-flow) | 29-49 | `appendMessage`, `appendTool`, `turnId`, `SharedSessionCoordinator`, `SessionExecutionState`, `SnapshotStore.snapshot` |
| [Types that carry it](#types-that-carry-it) | 50-65 | `StoredSession`, `ChatTranscriptItem[]`, `turnId`, `SnapshotTurn`, `SnapshotFile[]`, `SessionExecutionState` |
| [Design decisions](#design-decisions) | 66-97 | `turnId`, `docs/technical-debt.md`, `JsonStore`, `TruncationStore` |
| [Known limits](#known-limits) | 98-105 | `ArtifactStore` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/agent/session.ts` | `SessionStore`: sessions and their transcript, persisted to `sessions.json` |
| `src/main/agent/shared-session-coordinator.ts` | `SharedSessionCoordinator`: one session, several agents, one turn at a time |
| `src/main/agent/snapshot.ts` | `SnapshotStore`: per-turn file snapshots behind undo |
| `src/main/agent/truncation.ts` | `TruncationStore`: what was cut from tool output, per session |
| `src/main/agent/trace-store.ts` | `TraceStore`: per-session trace events, buffered and flushed |
| `src/main/artifact-store.ts` | `ArtifactStore`: files an agent produced, per project |
| `src/main/json-store.ts` | `JsonStore<T>`: the flat-file persistence every store above sits on |

## Data flow

**A turn's record.** The runner appends to the transcript through `appendMessage`
and `appendTool`. Items carry a `turnId`, which is what makes a turn addressable
afterwards — for undo, for revert, and for rebuilding the prompt.

**Sharing a session.** `SharedSessionCoordinator` keys a `SessionExecutionState`
per project: the session and agent currently running, the `turnId`, a `locked`
flag, and a `queue`. A second agent asked to act on a locked session queues its
message instead of interleaving. When the turn finishes the lock releases and the
queue drains.

**Undo.** Before a tool writes to a file, `SnapshotStore.snapshot` records the
original content under the current turn. `undo` restores every file that turn
touched and returns what it reverted. `originals` reports the pre-turn content
without restoring, which is what a diff view reads.

**Artifacts.** A tool that produces a file calls `onArtifact`, and `ArtifactStore`
records it per project and notifies the renderer, which lists them in the right
panel.

## Types that carry it

`StoredSession` holds the session id, its agent and project, the transcript, and
the todos. The transcript is a `ChatTranscriptItem[]` where each item is either a
message or a tool call, and both carry `turnId`.

`SnapshotTurn` is a turn id plus the `SnapshotFile[]` it touched, each holding a
path and the content as it was before the turn.

`SessionExecutionState` is the shared-session lock: `projectPath`, `sessionId`,
`agentId`, `turnId`, `locked`, an optional `promptId` for a pending question, and
the `queue`.

`ArtifactEntry` is stored without `id` and `ts` by the caller — `ArtifactStore`
assigns both, so a tool cannot invent an identity.

## Design decisions

**One session can be driven by several agents, but only one at a time.** The
coordinator locks per project rather than per agent. Two agents writing into one
transcript concurrently would produce a record that neither the model nor a human
could read in order. Queueing preserves the order and loses nothing.

**Queued messages wait at the coordinator, not in the loop.** The turn loop has
its own steering queue drained at step boundaries. That one carries messages for
the turn already running; this one carries messages for a turn that has not
started. Keeping them separate is what lets a steer arrive mid-turn while a
second agent's request waits its turn.

**Snapshots are per turn, not per edit.** A turn is the unit a user thinks in —
"undo what it just did" — and it is also the unit the transcript is keyed by. Per
edit undo would need a finer identity than `turnId`, which is debt item 9's
per-message undo entry in `docs/technical-debt.md`.

**Every store sits on the same flat-file `JsonStore`.** No database. The data is
small, the access pattern is read-all-write-all, and a JSON file is inspectable
when something goes wrong. A parse failure returns an empty collection rather
than throwing, so a corrupt file degrades to an empty history instead of a
non-starting app.

**Traces are buffered and flushed asynchronously.** A trace event per stream part
would otherwise turn every token into a disk write. Sequence numbers are per
session, so ordering survives the buffering.

**Truncated tool output is stored, not discarded.** `TruncationStore` keeps what
was cut at 51200 bytes or 2000 lines, so the UI can offer the full text even
though the model saw the short version.

## Known limits

Undo is whole-turn. There is no per-message revert and no redo history beyond the
last turn — debt item 9.

`ArtifactStore` is in-memory, rebuilt from tool events, and scoped to a project
for the lifetime of the window.
