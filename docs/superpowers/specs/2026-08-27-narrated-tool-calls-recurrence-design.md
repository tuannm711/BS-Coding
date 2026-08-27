# Narrated tool calls, second time — design

Date: 2026-08-27
Branch: `fix/narrated-tool-calls`
Supersedes nothing: `docs/superpowers/specs/2026-08-25-narrated-tool-calls-design.md`
still describes what v1.1.6 fixed, and that fix still holds.

## What actually happened, from the stored transcript

Session *"Thực hiện Wave 6"*, items 736–745, both turns on `openai/gpt-5.6-sol`:

| Item | Agent | What |
|---|---|---|
| 736–742 | `h.ernandezrob5612` | working normally — tool calls between short replies |
| **743** | `h.ernandezrob5612` | 21,042 characters opening `- read :: <path> :: 75 :: 50物理 reasoned breakdown:` |
| 744 | — | the owner types *"tiếp tục"* and switches to `a.lcottdustin6360` |
| **745** | `a.lcottdustin6360` | 8,468 characters opening `- read · completed\n  input: {…}\n  output: …` |

These are two different failures and only one of them is ours.

**743 is not imitation of anything this product emits.** `::` appears nowhere in
the codebase or the skills, and the text carries mojibake (`50物理`). It is a
degraded generation that invented its own separators.

**745 is imitation, and exact.** It reproduces the body `compileNeutralContext`
writes — `- <tool> · <status>`, two-space `input:`, two-space `output:` — with
the header omitted. The agent changed between the two, so the runner, the system
prompt and the tools all changed; what carried across was the **history**.

## Why the v1.1.6 fix did not prevent this

That fix moved tool records out of the assistant role, because text in the
assistant role is what a model imitates. It works, and the records still sit in
the user role.

But a **narration is an assistant message.** It is stored like any reply and
replayed to every later turn as the assistant's own prose. So the first
narration recreates by hand exactly the condition the fix removed — and 743 → 745
is that happening across an agent switch.

Detection alone does not stop this. The renderer's notice tells the reader; it
does not change what the next turn is shown.

## The detector is anchored on the wrong part

```ts
const NARRATED = /^(?:\[Tool [^\]\n]+ · (?:completed|failed)\]\s*\r?\nInput:|\[Session log[^\]\n]*\]\s*\r?\n- )/m
```

Two alternatives, and neither matches 745:

- The first describes a format that **no longer exists** — records have not been
  headed `[Tool … · completed]` with a capitalised `Input:` since v1.1.6.
- The second requires the `[Session log …]` header before the `- `. The model
  copies the body and drops the header, which is the natural thing to copy: the
  header says in words that it is not a format to reproduce.

Measured across all 1,655 assistant messages in the owner's store: 2 match the
current detector, 1 matches the record body and is missed, and 743 matches
neither.

## Approach

### 1. Detect the body

Match `- <tool> · completed|failed` followed by an indented `input:` line, at a
line start. Drop the dead `[Tool …]` alternative. Keep the `[Session log …]`
alternative — a message reproducing the header is narration too.

The pattern stays in `src/shared/narrated-tool-call.ts`, which both processes
already import, so main flags at append time and the renderer flags what a
stored transcript already holds.

**Not matched, deliberately:** 743. Its shape is the model's own invention, and
a pattern loose enough to catch `- read :: … :: 75 :: 50物理` would catch
ordinary prose about a `read`. It is caught by consequence rather than by shape —
see below.

### 2. Quarantine, so one narration does not seed the next

`ChatMessage` gains `narrated?: boolean`, written where the flag is already
computed:

```ts
appendMessage: (msg) => {
  ...
  if (msg.role === 'assistant' && looksLikeNarratedToolCall(msg.text)) {
    this.emit({ type: 'narrated-tool-call', agentId: agent.id })
  }
```

That call already runs and throws its answer away.

Both compilers then refuse to replay a flagged message as assistant prose:

- `toLlmMessages` — the ordinary path
- `compileNeutralContext` — the shared-session and post-handoff path

It is replaced, not dropped, by one line in the **user** role:
`[A reply here was a written-out tool call and did not run. It has been left out.]`
Dropping it silently would leave a user message answered by nothing, and the
next turn would read the request as unanswered.

**This is what catches 743.** Its shape is not matched, but the moment any
message in the session is flagged, the replacement line tells the next turn that
narration happened here and did not run. A degraded generation still costs one
turn; it no longer costs every turn after it.

### 3. Existing sessions

The flag is absent on everything already stored. The renderer already
re-evaluates stored text with the detector, so the notice appears on old
sessions once the pattern is fixed. The **compilers** must do the same: treat a
message as narrated if the flag is set **or** the text matches. Flag-only would
leave the owner's Wave 6 session seeding narration forever.

## Verification

1. A message matching the record body is flagged at append time.
2. A message reproducing the `[Session log …]` header is still flagged.
3. Ordinary prose mentioning a tool — "I will read the file" — is not.
4. The dead `[Tool … ] / Input:` alternative is gone and nothing depended on it.
5. `toLlmMessages` replaces a flagged assistant message with the user-role line
   and keeps the surrounding turns intact.
6. `compileNeutralContext` does the same.
7. A stored message with no flag but matching text is treated as narrated by
   both compilers — the owner's existing session must stop seeding.
8. The renderer still renders its notice, from the same pattern.
9. `npm test`, `npm run typecheck`, `npm run build`.

## Risks

**A false positive silences a real reply.** A message that genuinely quotes a
session log — a user asking the agent to explain one — would be replaced rather
than replayed. The pattern requires a line-start `- <tool> · <status>` followed
by an indented `input:`, which prose does not produce by accident, but the cost
of being wrong is higher than it was when detection only drew a notice.

**The replacement line is itself text in the history.** It is in the user role
and says nothing tool-shaped, so it does not carry the property it is there to
stop.

**743 remains possible.** Nothing here prevents a model from degrading; the
scope of the fix is that one bad turn stays one bad turn.

## Out of scope

**Changing the record format.** Dropping the `- ` prefix to make the body less
imitable was considered and set aside: it changes the format every shared-session
turn reads, to buy an unmeasured reduction in how often narration starts, and it
does nothing about contagion once a narration exists. Worth revisiting with data
from this fix, as its own piece of work.

**Rejecting and retrying the step.** 743 shows the trigger can be model
degradation, and retrying a degrading model is a loop.

## Success criteria

A narrated reply is flagged whatever shape of the current record format it
copies, is visible to the reader, and is never replayed to a later turn as
something the assistant said.
