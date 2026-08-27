# Agent runtime

The native BS agent: how one turn runs, how a tool gets called and gated, and how
context is kept under the model's limit. This is the largest domain in the
codebase. Provider selection and credentials live in `docs/design/03-providers.md`;
this document assumes an `LlmClient` already exists.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 22-41 | `src/main/bs-agent-manager.ts`, `BsAgentManager`, `src/main/agent/loop.ts`, `SessionRunner`, `src/main/agent/llm.ts`, `LlmClient` |
| [Data flow](#data-flow) | 42-70 | `BsAgentManager`, `SessionRunner`, `LoopDeps`, `toLlmMessages(getItems())`, `LlmClient`, `text-delta` |
| [Types that carry it](#types-that-carry-it) | 71-85 | `LoopDeps`, `src/main/agent/loop.ts`, `getItems`, `appendMessage`, `appendTool`, `tests/unit/agent-loop.test.ts` |
| [Design decisions](#design-decisions) | 86-119 | `LoopDeps`, `createLlm`, `LlmClient`, `src/main/agent/AGENTS.md`, `takeSteers`, `tools/` |
| [Two ways to hand work off](#two-ways-to-hand-work-off) | 120-145 | `SessionRunner`, `SUBAGENT_CONFIGS`, `COORDINATE_RULES`, `visibleToolDefs`, `decidePermission`, `runAssignment` |
| [One conversation format](#one-conversation-format) | 146-163 | `tool-call`, `tool-result`, `toLlmMessages`, `compileNeutralContext`, `thoughtSignature`, `sendInSession` |
| [What a handoff borrows](#what-a-handoff-borrows) | 164-193 | `systemSuffix` |
| [What a coordinator is told, and what it can reach](#what-a-coordinator-is-told-and-what-it-can-reach) | 194-225 | `coordinatorNote`, `BsAgentManager`, `systemSuffix`, `modeNote`, `decidePermission`, `--output` |
| [Known limits](#known-limits) | 226-238 | `MAX_COMPACT_PER_RUN`, `compactIfOverThreshold`, `undoTurn`, `pushTurn`, `turnId` |
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

## Two ways to hand work off

They look alike and are not.

The **`task` tool** runs an anonymous subagent: a fresh `SessionRunner` with a
fixed prompt from `SUBAGENT_CONFIGS`, a restricted tool list and an in-memory
transcript that is discarded. It exists to parallelise work inside one agent's
turn.

The **`delegate` tool** assigns work to one of the user's own agents. That agent
runs a normal turn in its own persisted session, with its own provider, account
and history, and its final message comes back as the tool output. Nothing is
shared between the two conversations — the task text is all the worker sees.

`delegate` is offered only in `coordinate` mode, where `COORDINATE_RULES` denies
every working tool. The restriction is enforced by `visibleToolDefs`, which
drops anything `decidePermission` denies, so a coordinator is never shown an
edit tool to decline. Asking a model not to write is not the same as removing
write.

Concurrency needs no scheduler, but not for the reason once written here.
`send` resolves when a **busy** agent accepts the message into its queue, not
when the turn ends — so `runAssignment` uses `sendAwaited`, which resolves after
that message's own turn. `running` is keyed per agent, so two assignments to
different agents run at once and two to the same agent queue.

## One conversation format

Both compilation paths emit the same shape: `assistant` messages carrying
`tool-call` parts, answered by `tool` messages carrying `tool-result`.
`toLlmMessages` does it from the live transcript; `compileNeutralContext` does
it from a sanitised copy — fresh tool ids, no `thoughtSignature`, no unfinished
calls — and then calls `toLlmMessages` itself.

**It used to flatten prior turns into prose**, on the reasoning that stripping
provider metadata required it. It did not, and the cost was the whole defect:
every conversation in this app goes through `sendInSession`, so every model was
shown its own earlier tool use as lines of text, and models reproduced them
instead of calling tools. There is now no such format to reproduce, and the
system note that used to explain it is gone.

A tool item with no assistant message ahead of it gets an empty one, so its
result always answers a call that was made.

## What a handoff borrows

A quota refusal moves the turn to another **account**, and that is all it moves.

```ts
// loop.ts, per step
const target = this.deps.currentTarget?.()
const stream = (target?.llm ?? this.deps.llm).stream({
  model: target?.model ?? this.deps.model,
  system: this.deps.system + (this.deps.systemSuffix?.() ?? ''),
  tools: isLastStep ? [] : this.visibleToolDefs(),
```

`llm` and `model` come from the serving agent. **`tools`, `system` and
`systemSuffix` stay with the agent whose turn it is** — its permissions, its
instructions, its mode note, its identity.

The prompt used to be borrowed too, which meant a plan-mode turn moving to a
build agent's account lost its read-only note while still holding plan-mode
tools. It no longer is.

**There is no filter on candidates.** One existed, restricting them to the same
mode, on the claim that the tool set differed — it never did. With the prompt no
longer borrowed there is nothing left to protect, and removing it also gave a
coordinator a fallback again: coordination is exclusive per project, so a
same-mode filter left it with no candidate at all.

An agent nobody assigned a role to is therefore spare quota without a rule
saying so.

## What a coordinator is told, and what it can reach

**Told, at each call.** `coordinatorNote` in `BsAgentManager` composes into
`systemSuffix`, which the loop resolves per step. It names the role, lists every
other native agent in the project with its provider and model, says to assign by
default rather than wait, and says each task must stand on its own because the
worker sees only that text.

It is not in `modeNote`. Runners are cached per agent, so a roster fixed when the
runner was built goes stale the moment an agent is added or changes mode.

**Reach.** Write, edit, apply-patch, revert, bash and `task` are denied — the
tools are absent from what the model is shown, not merely discouraged. `git` is
allowed for an allowlist of read-only subcommands, through the same input-aware
branch in `decidePermission` that lets plan mode read with bash but not write.
`--output` is refused on any of them, because it writes a file from `diff`.

`read`, `glob` and `grep` are kept. A coordinator could instead be told to have a
worker investigate and report, and that is rejected: a report is a summary, and
`docs/technical-debt.md` item 6 records what happens when design is written from
a summary rather than from the code.

`task` is denied so nothing is assigned outside the exchange — an anonymous
subagent would be invisible to the coordination view and unrecorded as an
assignment.

**The division of labour is instruction, not enforcement.** Removing a tool is
enforcement. Nothing removes a worker's ability to reason, and nothing should:
a worker needs enough judgement to notice that what it was told to do did not
work, and to say so. Each delegated task carries one sentence asking exactly
that — carry it out, and report back rather than changing the approach.

## Known limits

Compaction runs at the top of each step and the turn continues into the next
model call, so there is nothing to resume. What is capped is how often:
`MAX_COMPACT_PER_RUN` is 2, after which `compactIfOverThreshold` returns early
and the turn proceeds with a context it already knows is over the limit. Overflow
detection is proactive only — a provider that rejects the request for length is
not recovered from.

Undo and redo are turn-granular. `undoTurn` addresses a turn by id and
`pushTurn` re-inserts it, so any turn can be reverted and re-applied, but a
message cannot: `turnId` is the finest identity the transcript carries.
