# Narrated tool calls: the history was prose — design

Date: 2026-08-27
Branch: `fix/narrated-tool-calls`
Revises: `docs/superpowers/specs/2026-08-25-narrated-tool-calls-design.md`, whose
cause section reached a conclusion its own evidence does not support.

## The question that found this

The owner asked why Codex, against the same ChatGPT and DeepSeek accounts, never
does this. That question is the whole finding: the first version of this spec
caught the model **imitating** a format and stopped it **spreading**, and never
asked why the model was shown tools as prose to begin with.

## Every conversation in this app is a shared session

```
ChatPanel.tsx:427   sendSessionChat(projectPath, sessionId, agentId, …)
preload             Channels.ChatSend
main/index.ts:908   mainApp.bsAgent.sendInSession(…)
```

That is the only send path the UI has. `sendInSession` always creates a
`sessionExecutions` entry, so `executionForAgent` is never null during a turn
from the window, so `buildMessages` always takes the shared branch: **prior turns
through `compileNeutralContext`, current turn through `toLlmMessages`.**

`compileNeutralContext` emits `user` and `assistant` messages of text only. No
`tool-call` part, no `tool-result` message. Every tool the agent used in every
earlier turn is replayed to it as a line of prose:

```
[Session log — tools already run in this session by its agents. …]
- read · completed
  input: {"file_path":"…","offset":70,"limit":60}
  output: (lines 71-129 of 129)
```

So the model is shown a conversation in which using a tool looks like writing
that. It writes that. Codex keeps native tool-call structure end to end and
has no multi-agent shared history to flatten, which is why the same accounts
behave differently there.

## Two sentences in the record that hid this

**"The flattening itself is necessary and must stay."** Justified by needing to
strip Google `thoughtSignature`, provider-specific tool call ids and unfinished
calls. None of those require destroying the structure — a call can be re-emitted
natively under a fresh id. Neutral should mean **neutral ids**, not **neutral
shape**.

**"Scope is limited to shared project sessions. Single-agent chat goes through
`toLlmMessages` and is unaffected."** True of the code and false of the product:
there is no other path from the window. It made the blast radius read as an edge
case when it is every conversation.

And a test pins the shape rather than the requirement:

```ts
expect(serialized).not.toContain('tool-call')
```

That assertion is the design decision, and it is the one being reversed.

## What the transcript shows, for the record

Session *"Thực hiện Wave 6"*, both turns `openai/gpt-5.6-sol`:

| Item | Agent | What |
|---|---|---|
| 736–742 | `h.ernandezrob5612` | normal tool use |
| **743** | `h.ernandezrob5612` | 21,042 chars opening `- read :: <path> :: 75 :: 50物理` |
| 744 | — | owner types *"tiếp tục"*, switches agent |
| **745** | `a.lcottdustin6360` | 8,468 chars reproducing the record body exactly |

743 invented its own separators and carries mojibake — a degraded generation,
not imitation of anything emitted here. 745 is exact imitation, by a different
agent with a different runner and prompt; the only thing shared was the history.

## Approach

### 1. Replay tool calls natively

`compileNeutralContext` emits, per turn, what `toLlmMessages` already emits —
minus everything provider-specific:

```ts
// assistant
{ role: 'assistant', content: [
  { type: 'text', text: prose },
  { type: 'tool-call', toolCallId: 'n1', toolName: 'read', input: … }
]}
// then
{ role: 'tool', content: [
  { type: 'tool-result', toolCallId: 'n1', toolName: 'read', output: { type: 'text', value: … } }
]}
```

- **Fresh ids.** `n1`, `n2`, … assigned per compilation, so no provider sees
  another provider's identifiers. The result must carry the same id as its call.
- **No `thoughtSignature`, no `providerOptions`.** As today.
- **Unfinished and pending calls stay dropped.** A call with no result would
  leave an assistant message a provider will reject.
- **Errors keep `type: 'error-text'`**, as `toLlmMessages` does.

`RECORD_HEADER` and the record strings go. There is no longer a format to
explain, so `SHARED_SESSION_RECORD_NOTE` goes with them.

### 2. Keep the detector, as a net rather than a cure

The regex still misses what actually happened — both alternatives anchor on a
header the model omits, and one describes a format gone since v1.1.6. Fix it to
match the body, `- <tool> · completed|failed` followed by an indented `input:`,
and drop the dead alternative.

This is no longer the fix. It is what tells us if the fix did not work, and it
still flags the sessions already carrying narration.

**Deliberately not done: quarantine.** The previous draft of this spec proposed
excluding a flagged message from later context. With the history in native form
there is nothing seeding imitation, and a rule that rewrites what the model is
shown carries a real cost when it fires wrongly. If narration recurs after this,
that is the evidence quarantine would need — and it is not in evidence now.

### 3. Attribution, which this does lose

Today the record says these tools were run "by its agents", plural. Native parts
have no way to say another agent made the call: agent B will see agent A's calls
as its own.

The assistant prose still carries agent names through `execution`, and the turn
that matters — the one being answered — is the agent's own. Judged the smaller
cost of the two, and named here so it is a decision rather than an oversight.

## Verification

1. `compileNeutralContext` emits `tool-call` and `tool-result` parts, with the
   result's id matching its call.
2. Ids are freshly generated: no original id from the transcript appears.
3. No `thoughtSignature` and no `providerOptions` in the output.
4. A call with no result is omitted, and no assistant message is left holding an
   unanswered call.
5. A tool error becomes `type: 'error-text'`.
6. Tool output is truncated by `toolOutputMaxChars`, as now.
7. The `[Session log …]` header and `SHARED_SESSION_RECORD_NOTE` no longer
   appear anywhere in a compiled prompt.
8. The detector matches the record body, still matches the header, and does not
   fire on prose that mentions a tool.
9. `npm test`, `npm run typecheck`, `npm run build`.
10. **In the app, against a real Antigravity account**: a shared session with two
    or more prior tool-using turns completes a further turn without the provider
    rejecting the replayed calls.

## Risks

**Replaying tool calls to Gemini without `thoughtSignature` is untested.** They
have never been sent as tool calls at all, so no provider has yet had the chance
to refuse them. Antigravity is the one to try first, and step 10 above is not
optional — if it refuses, this approach needs a per-provider answer before it
can ship.

**Every shared-session turn changes shape.** That is the point, and it is the
whole product: not an edge case, and not reversible one conversation at a time.

**Losing cross-agent attribution.** Recorded above.

**The detector could still be wrong about what it is looking for.** It is now a
net, not the fix, so a miss costs visibility rather than correctness.

## Out of scope

**Changing what a single agent sends.** `toLlmMessages` already emits native
parts and is not touched.

**Quarantining flagged messages.** Recorded above, with the condition under
which it would be revisited.

## Success criteria

A model is never shown its own tool use as prose. `compileNeutralContext`
produces the same conversation shape as `toLlmMessages`, differing only in that
nothing provider-specific survives it.
