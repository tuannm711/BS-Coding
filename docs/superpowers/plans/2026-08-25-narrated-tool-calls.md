# Narrated Tool Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Stop shared-session history teaching models to narrate tool calls, and
make it visible when one narrates anyway.

**Architecture:** One pure module changes shape (`neutral-context.ts`), one event
is added to the chat contract, and the renderer grows one notice row. Nothing
about how tools actually execute changes.

**Tech Stack:** TypeScript, vitest, React 19 renderer.

## Global Constraints

- Do not remove `compileNeutralContext`. `tests/unit/neutral-context.test.ts`
  pins why it exists: it strips Google `thoughtSignature`, provider tool call
  ids, and pending calls. Those assertions must keep passing.
- Do not touch `toLlmMessages`. Single-agent chat is unaffected and must stay so.
- Do not rewrite stored transcripts. The narrated messages already in
  `sessions.json` stay exactly as they are.
- The compiled context must never contain two consecutive messages of the same
  role: `toContents` in `src/main/agent/antigravity-llm.ts` maps roles one to one
  and Gemini expects alternating turns.
- Test baseline: 142 files, **1042** tests. Each task states its running total.
- Do not tag or bump the version.

### A correction the spec got wrong

The spec says the existing neutral-context test "must keep passing unchanged".
That is only true of its stripping assertions. It also asserts the literal string
`[Tool read · completed]`, which this work replaces, so that line changes. The
role-sequence assertion `['user', 'assistant', 'user', 'assistant']` does survive:
coalescing merges each record into the following turn's user message, which
restores the alternation the current output already has.

---

### Task 1: Move tool records out of the assistant role

**Files:**
- Modify: `src/main/agent/neutral-context.ts`
- Modify: `tests/unit/neutral-context.test.ts`

**Interfaces:**
- Produces: `compileNeutralContext` output where no assistant message contains a
  tool record, and no two adjacent messages share a role.

- [x] **Step 1: Write the failing tests**

Add to `tests/unit/neutral-context.test.ts`:

```ts
  it('keeps tool records out of the assistant role', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const assistant = messages.filter(message => message.role === 'assistant')
    for (const message of assistant) {
      expect(String(message.content)).not.toContain('read')
    }
    expect(JSON.stringify(messages)).toContain('read')
  })

  it('never emits two adjacent messages of the same role', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].role).not.toBe(messages[i - 1].role)
    }
  })

  it('frames the record as a log rather than as speech', () => {
    const serialized = JSON.stringify(compileNeutralContext(items, { toolOutputMaxChars: 4 }))
    expect(serialized).toContain('Session log')
    expect(serialized).toContain('tool interface')
  })
```

Reuse the `items` fixture already declared in that file by lifting it out of the
existing `it` into the `describe` scope. Change the existing assertion
`expect(serialized).toContain('[Tool read · completed]')` to match the new record
shape; leave every `not.toContain` assertion exactly as it is.

- [x] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/neutral-context.test.ts
```

Expected: the three new cases fail; the stripping assertions still pass.

- [x] **Step 3: Implement**

In `neutral-context.ts`, replace the per-group reply assembly. Prose stays in the
assistant message; tool records become their own user-role message:

```ts
const RECORD_HEADER = [
  '[Session log — tools already run in this session by its agents.',
  'This is a record, not a message, and not a format to reproduce.',
  'To use a tool, call it through the tool interface.]'
].join(' ')
```

Per group: collect `prose: string[]` from message replies and `records: string[]`
from finished tool replies, where a record reads

```
- read · completed
  input: {"file_path":"a.ts"}
  output: abcd
```

Push the assistant message when `prose` is non-empty, then the record message
`{ role: 'user', content: [RECORD_HEADER, ...records].join('\n') }` when
`records` is non-empty. The `[Incomplete response from X]` note stays with the
prose, because it describes the assistant's own turn.

Then coalesce before returning:

```ts
function coalesce(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = []
  for (const message of messages) {
    const last = out[out.length - 1]
    if (last && last.role === message.role && typeof last.content === 'string' && typeof message.content === 'string') {
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${message.content}` } as ModelMessage
      continue
    }
    out.push(message)
  }
  return out
}
```

Only string contents merge; a message carrying image parts is left alone, which
is why the check tests both sides.

- [x] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1045**. Commit as
`fix: keep shared-session tool records out of the assistant role`.

Body must say why: a model imitates the format it sees its own role producing.

---

### Task 2: Detect a narrated tool call

**Files:**
- Modify: `src/main/agent/neutral-context.ts` (export the detector)
- Modify: `src/shared/types.ts` (`ChatEvent`)
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `tests/unit/neutral-context.test.ts`

**Interfaces:**
- Produces: `looksLikeNarratedToolCall(text: string): boolean` and a
  `{ type: 'narrated-tool-call'; agentId: string }` chat event.

- [x] **Step 1: Write the failing tests**

```ts
describe('looksLikeNarratedToolCall', () => {
  it('recognises a narrated call', () => {
    expect(looksLikeNarratedToolCall('[Tool bash · completed]\nInput: {"command":"ls"}\nOutput: a')).toBe(true)
    expect(looksLikeNarratedToolCall('text before\n\n[Tool read · failed]\nInput: {}\nError: no')).toBe(true)
  })

  it('does not fire on ordinary prose that mentions tools', () => {
    expect(looksLikeNarratedToolCall('I will use the bash tool to list files.')).toBe(false)
    expect(looksLikeNarratedToolCall('The [Tool] section of the docs explains Input: and Output:.')).toBe(false)
    expect(looksLikeNarratedToolCall('')).toBe(false)
  })
})
```

- [x] **Step 2: Run to confirm failure**

Expected: `looksLikeNarratedToolCall is not a function`.

- [x] **Step 3: Implement the detector**

In `neutral-context.ts`, beside the format it owns:

```ts
// The shape this module used to emit into the assistant role, which models
// learned to reproduce. Anchored to a line start and followed by the Input line,
// so prose mentioning a tool does not trip it.
const NARRATED = /^\[Tool [^\]\n]+ · (?:completed|failed)\]\s*\r?\nInput:/m

export function looksLikeNarratedToolCall(text: string): boolean {
  return NARRATED.test(text)
}
```

- [x] **Step 4: Add the event and emit it**

In `src/shared/types.ts`, add to `ChatEvent`:

```ts
  | { type: 'narrated-tool-call'; agentId: string }
```

In `src/main/bs-agent-manager.ts`, in the `appendMessage` wrapper passed to the
runner, after storing the message:

```ts
        if (msg.role === 'assistant' && looksLikeNarratedToolCall(msg.text)) {
          this.emit({ type: 'narrated-tool-call', agentId: agent.id })
        }
```

The manager is the right place: `loop.ts` has no business knowing about a format
that belongs to shared-session compilation.

- [x] **Step 5: Check the contract test**

```bash
npx vitest run tests/unit/ipc-contract.test.ts
```

A new `ChatEvent` member may need listing there. Extend it if so.

- [x] **Step 6: Verify and commit**

Expected: **1047**. Commit as `feat: detect a tool call a model narrated instead of making`.

---

### Task 3: Show the warning in the chat

**Files:**
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Modify: `src/renderer/src/styles.css`

- [x] **Step 1: Add the feed item**

Extend `FeedItem` at `ChatPanel.tsx:18`:

```ts
  | { kind: 'notice'; id: string; text: string }
```

- [x] **Step 2: Handle the event**

Beside the `compaction-failed` branch at `ChatPanel.tsx:422`:

```ts
    if (e.type === 'narrated-tool-call') {
      setItems(prev => [...prev, {
        kind: 'notice',
        id: 'n-' + Date.now(),
        text: 'The model wrote out a tool call instead of making one. Nothing ran.'
      }])
      return
    }
```

- [x] **Step 3: Render it**

Beside the compaction row at `ChatPanel.tsx:775`:

```tsx
          if (item.kind === 'notice') {
            return <div key={item.id} className="chat-notice">{item.text}</div>
          }
```

Add a `.chat-notice` rule to `styles.css` next to `.chat-compacted`, using the
warning colour tokens already defined there rather than new ones.

- [x] **Step 4: Verify and commit**

Expected: **1047**, unchanged — this task adds rendering, not behaviour. Commit as
`feat: surface a narrated tool call in the transcript`.

---

### Task 4: Tell the model in the system prompt

**Files:**
- Modify: `src/main/bs-agent-manager.ts`

- [x] **Step 1: Add the line**

Where the shared-session system prompt is assembled, append one sentence: records
in the history are logs of tools already run, and a tool is used by calling it
through the tool interface, never by writing out what a call would look like.

Add it only on the shared-session path, where the records appear. Single-agent
chat never sees them and does not need the warning.

- [x] **Step 2: Verify and commit**

Expected: **1047**. Commit as `feat: tell shared sessions that history records are logs`.

Body should say plainly that this is the weakest of the three changes and is not
relied on alone.

---

### Task 5: Verify and report

- [x] **Step 1: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, not a grep of the output.

- [x] **Step 2: Confirm the compiled context by inspection**

Compile a small fixture through `compileNeutralContext` in a scratch script and
read the output. Confirm by eye that no assistant message contains a record and
the roles alternate. The tests assert both, but this is the artefact a model
actually reads and it is worth looking at once.

- [x] **Step 3: Run the app**

Start a shared session with two agents on one project. Confirm a turn produces
real tool cards, and that no notice appears. The detector firing here would mean
the fix did not take.

- [x] **Step 4: Report and stop**

Do not merge, tag, or push. Report all five tasks and wait for the final gate.
