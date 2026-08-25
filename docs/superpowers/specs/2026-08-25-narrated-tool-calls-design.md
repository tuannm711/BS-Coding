# Narrated tool calls in shared sessions — design

Date: 2026-08-25
Branch: `fix/gemini-tool-call-compat`
Release: v1.1.6

## Problem

In a shared project session, models write text that looks like a tool
transcript instead of calling the tool:

```
[Tool todowrite · completed]
Input: {"todos":[...]}
Output: [...]
```

Nothing runs. The turn appears productive and changes nothing, and the only way
to tell is that a narrated call renders as plain text while a real one renders as
a collapsible card in `src/renderer/src/components/chat/ToolCallCard.tsx`. The
user found it by eye.

**It is not a Gemini incompatibility.** Measured against the stored transcript of
the affected session:

| Agent | Assistant messages | Narrated | Real tool calls |
|---|---|---|---|
| `anti-gemini-flash` | 79 | 12 | 61 |
| `anti-claude-sonnet` | 28 | 4 | 23 |
| `anti-claude-opus` | 123 | 1 | 121 |
| a fourth agent | 66 | 0 | 93 |

Gemini is worst at roughly 15%, but Claude Sonnet is at 14% and Opus does it too.
Three providers, one behaviour.

The Antigravity plumbing is correct: `src/main/agent/antigravity-llm.ts` sends
full `functionDeclarations` and parses `functionCall` parts back into tool calls.
The same agent made 61 real calls in the same session.

## Cause

`src/main/bs-agent-manager.ts:1345` builds a shared-session prompt in two layers:
prior turns through `compileNeutralContext`, the current turn through
`toLlmMessages`.

`src/main/agent/neutral-context.ts` flattens every prior tool call into text and
appends it to an **assistant** message — the exact string above. The model reads
its own role producing that format and continues the pattern. Having done it
once, it sees its own narration in the next turn's history, and repeats.

The flattening itself is necessary and must stay. `tests/unit/neutral-context.test.ts`
pins why: it strips Google `thoughtSignature` values, provider-specific tool call
ids, and unfinished calls, none of which another provider will accept.

Scope is limited to shared project sessions. Single-agent chat goes through
`toLlmMessages` and is unaffected — `executionForAgent` returns nothing outside
`sendInSession`.

## Approach

**Attribution, not wording.** The model imitates because the text sits in the
assistant role. Rewording a transcript that is still attributed to the assistant
weakens the signal without removing it.

Three changes.

**1. Move tool records out of the assistant role.** A turn compiles to the user's
message, then the assistant's own prose, then a separate record message carrying
that turn's tool calls. The record is framed as a log rather than as anybody's
speech, and says plainly that tools are invoked through the tool interface.

**2. Coalesce consecutive same-role messages.** The record sits in the user role,
so a turn boundary would otherwise produce two user messages in a row.
`toContents` in `antigravity-llm.ts` maps roles one-to-one without merging, and
Gemini expects alternating turns. Coalescing inside `compileNeutralContext` keeps
the alternation the current output already has.

**3. Detect a narration and show it.** When an assistant message arrives matching
the record shape, emit a `narrated-tool-call` chat event and render a warning in
the transcript, following how `compaction-failed` already surfaces through
`ChatPanel.tsx:422`. This does not prevent anything; it turns a silent failure
into a visible one, which is what the user had to do by eye.

A short line is also added to the shared-session system prompt stating that
records in the history are logs and that tools must be called through the tool
interface. It costs nothing and is the weakest of the three, so it is not relied
on alone.

## Verification

1. `compileNeutralContext` emits no tool record inside an assistant message.
2. Its output never contains two consecutive messages of the same role.
3. It still strips `thoughtSignature`, provider tool call ids, and pending calls
   — the existing test must keep passing unchanged.
4. A message whose text matches the record shape raises `narrated-tool-call`; an
   ordinary assistant message does not, and neither does a message merely
   containing the word Tool.
5. The warning renders in the chat transcript.
6. `npm test` and `npm run typecheck` pass.
7. In the running app, a shared session with two agents completes a turn with
   real tool cards and no warning.

## Risks

**The record's new framing is itself imitated.** Possible. Detection in change 3
is what would reveal it, which is the argument for doing both rather than either.

**Coalescing changes what a model sees.** Two adjacent user messages become one.
That is closer to the current shape, not further from it, since today's output
already alternates.

**The warning fires on legitimate text.** A model quoting a tool record while
explaining itself would trip it. The pattern requires the bracketed header at the
start of a line followed by an `Input:` line, which prose rarely produces, and a
false warning costs a line in the transcript.

## Out of scope

**Rewriting the 17 narrated messages already stored.** The user chose to leave
them. The consequence is worth stating: they remain in that session's history as
assistant text, so a model reading it can still learn the pattern there. New
sessions are unaffected, and the detector will flag it if it recurs.

**Preventing narration outright.** No prompt guarantees it. This makes it less
likely and always visible.

**Single-agent chat.** Not affected.

## Success criteria

Tool records no longer appear in the assistant role; the compiled context
alternates roles; a narrated tool call raises a visible warning instead of
passing silently; the existing neutral-context guarantees still hold.
