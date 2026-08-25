# Agent runtime

The native BS agent: how one turn runs, how a tool gets called and gated, and how
context is kept under the model's limit. This is the largest domain in the
codebase. Provider selection and credentials live in `docs/design/03-providers.md`;
this document assumes an `LlmClient` already exists.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 18-37 | `src/main/bs-agent-manager.ts`, `BsAgentManager`, `src/main/agent/loop.ts`, `SessionRunner`, `src/main/agent/llm.ts`, `LlmClient` |
| [Data flow](#data-flow) | 38-66 | `BsAgentManager`, `SessionRunner`, `LoopDeps`, `toLlmMessages(getItems())`, `LlmClient`, `text-delta` |
| [Types that carry it](#types-that-carry-it) | 67-81 | `LoopDeps`, `src/main/agent/loop.ts`, `getItems`, `appendMessage`, `appendTool`, `tests/unit/agent-loop.test.ts` |
| [Design decisions](#design-decisions) | 82-115 | `LoopDeps`, `createLlm`, `LlmClient`, `src/main/agent/AGENTS.md`, `takeSteers`, `tools/` |
| [Known limits](#known-limits) | 116-123 | `docs/technical-debt.md`, `SnapshotStore` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/bs-agent-manager.ts` | `BsAgentManager`: owns sessions, config, permissions, subagents, and starts each turn |
| `src/main/agent/loop.ts` | `SessionRunner`: the turn loop itself — streams, executes tools, emits events |
| `src/main/agent/llm.ts` | `LlmClient` interface and `createLlm`, the seam that makes the loop testable |
| `src/main/agent/message.ts` | `toLlmMessages`: rebuilds the model prompt from stored transcript items |
| `src/main/agent/tools/registry.ts` | `createDefaultTools`: the tool map handed to a runner |
| `src/main/agent/tools/types.ts` | `ToolDefinition` — the contract every tool implements |
| `src/main/agent/permission.ts` | `decidePermission`: allow, ask or deny for a tool call |
| `src/main/agent/compact.ts` | Token-threshold compaction and `truncateToolOutput` |
| `src/main/agent/session.ts` | `SessionStore`: transcript persistence |
| `src/main/agent/snapshot.ts` | `SnapshotStore`: per-turn file snapshots behind undo |
| `src/main/agent/mcp/manager.ts` | MCP servers, whose tools join the same registry |
| `src/main/agent/lsp/manager.ts` | LSP clients behind the `lsp` tool and edit diagnostics |

`src/main/agent/AGENTS.md` carries the full file-by-file table. This document
covers how they fit together.

## Data flow

A turn is a loop over model steps, not a single request.

1. `BsAgentManager` resolves config, builds the system prompt from instructions
   and skills, collects the tool map, and constructs a `SessionRunner` with a
   `LoopDeps`.
2. The runner calls `toLlmMessages(getItems())` to rebuild the prompt from stored
   transcript items, then streams from the `LlmClient`.
3. Stream parts become events as they arrive: `text-delta`, `reasoning-delta`.
4. When the model requests a tool, the runner emits `tool-start`, asks
   `decidePermission`, and — if the answer is `ask` — emits a `prompt-request`
   and awaits the user through `ask`. On allow it runs the tool, on deny it feeds
   the refusal back as the tool result.
5. The tool result is truncated to the configured byte and line caps, appended to
   the transcript, and emitted as `tool-result`.
6. Before the next step, `takeSteers` drains any messages the user queued while
   the turn was running, injecting them at the step boundary.
7. If the estimated context exceeds the threshold, `compact.ts` summarises older
   items and emits `compacted`. At most two compactions per run.
8. The loop ends on a step with no tool calls, on `maxSteps` (default 50, with a
   final wrap-up prompt and tools disabled), on abort, or on error — emitting
   `done` or `error`.

The renderer sees only the `ChatEvent` stream. The eleven kinds are
`text-delta`, `reasoning-delta`, `tool-start`, `tool-result`, `prompt-request`,
`user-message`, `subagent-event`, `compacted`, `compaction-failed`, `done` and
`error`.

## Types that carry it

`LoopDeps` in `src/main/agent/loop.ts` is the whole contract of a turn. The
runner owns no store and reads no file directly: transcript access is
`getItems` / `appendMessage` / `appendTool`, permissions are a function, user
interaction is `ask`, and persistence is somebody else's problem. That is what
lets `tests/unit/agent-loop.test.ts` drive a complete turn against a stub.

`ToolDefinition` in `src/main/agent/tools/types.ts` is `name`, `description`, a
zod `schema`, and `run`. A tool is a plain object; nothing inherits.

`TranscriptItem` is the single source of truth for what the model sees.
`message.ts` rebuilds the prompt from it every step rather than keeping a
parallel message array, so there is no second copy to fall out of sync.

## Design decisions

**The loop takes its dependencies rather than reaching for them.** Everything the
runner needs arrives in `LoopDeps`. The alternative — importing the session store
and the permission service directly — would make the loop untestable without a
real filesystem and a real model.

**Tests never reach a real model.** `createLlm` is a factory behind the
`LlmClient` interface, so tests substitute a stub that yields scripted stream
parts. This is stated as a convention in `src/main/agent/AGENTS.md` because a
single test that forgets it turns the suite slow and flaky.

**Steering is injected at step boundaries, not mid-stream.** A message typed
while the agent is working is queued and drained by `takeSteers` between steps.
Injecting mid-stream would corrupt the message the model is still producing.

**Adding a tool touches three places.** Implement in `tools/`, register in
`tools/registry.ts`, and add a permission default in `config.ts`. A tool with no
permission default would fall through to whatever the catch-all decides, which is
not a decision anybody made.

**Tool output is truncated at the boundary, not by the tool.** The runner applies
the byte and line caps, so every tool gets the same treatment and no tool has to
remember. `TruncationStore` keeps what was cut, per session.

**Compaction is capped per run.** `MAX_COMPACT_PER_RUN` is 2. Without a cap a
prompt that is large for reasons compaction cannot fix would compact in a loop
until the step budget ran out.

**MCP and LSP join through existing seams.** MCP servers contribute tools into
the same `Map<string, ToolDefinition>` the built-ins use, so the loop cannot tell
them apart. LSP surfaces both as an explicit tool and as diagnostics returned
after an edit.

## Known limits

Compaction summarises but does not prune old tool output, and there is no
auto-continue after a compaction — both listed under debt item 9 in
`docs/technical-debt.md` as gaps against opencode.

Undo is whole-turn through `SnapshotStore`. There is no per-message revert.
