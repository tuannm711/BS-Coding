# Native Shared-Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A model is never shown its own tool use as prose, so there is no
tool-shaped text in its history for it to reproduce.

**Architecture:** `compileNeutralContext` stops writing text records and instead
sanitises the transcript — fresh tool ids, no provider metadata, no unfinished
calls — then hands it to `toLlmMessages`, which already emits native parts. The
two compilation paths become the same shape, differing only in what survives.

**Tech Stack:** TypeScript, vitest, Electron.

## Global Constraints

- Test baseline: **158 files, 1208 tests**. Report the count after each task.
- `toLlmMessages` is not modified. It already does the right thing; this plan
  makes the other path agree with it.
- Nothing provider-specific may survive compilation: no `thoughtSignature`, no
  `providerOptions`, no id that came from a provider.
- **Task 5 step 4 is not optional.** Replaying tool calls to Gemini without a
  `thoughtSignature` has never been attempted. If Antigravity refuses them,
  stop and report — do not invent a per-provider workaround unasked.
- Do not tag, bump the version, or merge.
- `fix/narrated-tool-calls` stays the only side branch.

---

### Task 1: Sanitise a transcript for replay

**Files:**
- Modify: `src/main/agent/neutral-context.ts`
- Test: `tests/unit/neutral-context.test.ts`

**Interfaces:**
- Produces: `neutraliseItems(items: ChatTranscriptItem[]): ChatTranscriptItem[]`
  — same conversation, nothing a provider could reject.

- [ ] **Step 1: Write the failing tests**

```ts
  it('gives every replayed call a fresh id', () => {
    // No provider may see another provider's identifiers.
    const out = neutraliseItems(items)
    const ids = out.flatMap(item => item.kind === 'tool' ? [item.tool.id] : [])
    expect(ids).not.toContain('call-openai-1')
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('drops a call that never finished', () => {
    // An assistant message holding a call with no result is rejected outright.
    const out = neutraliseItems(items)
    expect(JSON.stringify(out)).not.toContain('unfinished-call')
  })

  it('strips provider metadata from a call it keeps', () => {
    const out = neutraliseItems(items)
    expect(JSON.stringify(out)).not.toContain('thoughtSignature')
  })

  it('keeps the tool, its input and its output', () => {
    const out = neutraliseItems(items)
    const tool = out.find(item => item.kind === 'tool')
    expect(tool && tool.kind === 'tool' && tool.tool.tool).toBe('read')
    expect(JSON.stringify(out)).toContain('abcd')
  })
```

The fixture `items` already exists at the top of this file and carries
`call-openai-1`, `unfinished-call` and a `thoughtSignature`; reuse it rather
than writing a second one.

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/neutral-context.test.ts
```

Expected: `neutraliseItems is not a function`.

- [ ] **Step 3: Implement**

```ts
// Neutral means neutral *ids*, not neutral *shape*. The previous version read
// this requirement as licence to flatten every call into prose, which is what
// taught models that using a tool looks like writing about one.
export function neutraliseItems(items: ChatTranscriptItem[]): ChatTranscriptItem[] {
  const out: ChatTranscriptItem[] = []
  let n = 0
  for (const item of items) {
    if (item.kind === 'message') { out.push(item); continue }
    // A call with no outcome would leave an assistant message holding a call
    // nothing answers, which providers reject.
    if (item.tool.permission === 'pending') continue
    if (item.tool.output === undefined && item.tool.error === undefined) continue
    n += 1
    const { thoughtSignature: _signature, ...tool } = item.tool
    out.push({ kind: 'tool', tool: { ...tool, id: `n${n}` } })
  }
  return out
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1212**. Commit as `feat: sanitise a transcript instead of flattening it`.

---

### Task 2: Compile the shared history natively

**Files:**
- Modify: `src/main/agent/neutral-context.ts`
- Test: `tests/unit/neutral-context.test.ts`

- [ ] **Step 1: Rewrite the tests that pin the prose shape**

Three existing tests assert the format being removed and must be **replaced**,
not deleted quietly: `preserves semantic history without replaying provider tool
metadata`, `keeps tool records out of the assistant role`, and `frames the
record as a log rather than as speech`. The first keeps its name and most of its
assertions; the other two describe a record that no longer exists.

```ts
  it('preserves semantic history without replaying provider tool metadata', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const serialized = JSON.stringify(messages)
    expect(serialized).not.toContain('thoughtSignature')
    expect(serialized).not.toContain('call-openai-1')
    expect(serialized).not.toContain('unfinished-call')
    expect(serialized).not.toContain('providerOptions')
    // Reversed: this used to assert tool-call was absent. That assertion was
    // the design decision, and it is the one being undone — a history without
    // tool calls is a history that demonstrates tools are prose.
    expect(serialized).toContain('tool-call')
    expect(serialized).toContain('abcd')
  })

  it('answers every replayed call with its own result', () => {
    const messages = compileNeutralContext(items, { toolOutputMaxChars: 4 })
    const calls = messages.flatMap(m => Array.isArray(m.content)
      ? m.content.filter((p: { type: string }) => p.type === 'tool-call').map((p: { toolCallId: string }) => p.toolCallId) : [])
    const results = messages.flatMap(m => Array.isArray(m.content)
      ? m.content.filter((p: { type: string }) => p.type === 'tool-result').map((p: { toolCallId: string }) => p.toolCallId) : [])
    expect(calls.length).toBeGreaterThan(0)
    expect(results).toEqual(calls)
  })

  it('emits no session log header', () => {
    // There is no longer a format to explain, so nothing explains one.
    expect(JSON.stringify(compileNeutralContext(items, { toolOutputMaxChars: 4 })))
      .not.toContain('Session log')
  })

  it('still reports a turn that did not finish', () => {
    expect(JSON.stringify(compileNeutralContext(items, { toolOutputMaxChars: 4 })))
      .toContain('[Incomplete response from Reviewer]')
  })
```

The `never emits two adjacent messages of the same role` test asserts a rule
that existed because records were forced into the user role. Native tool
results are their own `tool` role, so check whether it still holds; if it does
not, replace it with the call/result pairing test above and say why in the
commit — do not weaken it silently.

- [ ] **Step 2: Run to confirm failure**

Expected: `tool-call` absent, `Session log` present.

- [ ] **Step 3: Implement**

```ts
export function compileNeutralContext(
  items: ChatTranscriptItem[],
  options: NeutralContextOptions
): ModelMessage[] {
  // The same shape toLlmMessages produces, from a transcript nothing
  // provider-specific survived. Two paths, one conversation format.
  return toLlmMessages(withIncompleteNotes(neutraliseItems(items)), {
    toolOutputMaxChars: options.toolOutputMaxChars
  })
}
```

`withIncompleteNotes` keeps the one thing the record framing carried that is
worth keeping: a turn whose execution ended `failed` or `stopped` gets
`[Incomplete response from <agent>]` appended to that turn's assistant text, as
it does today. Lift it out of the old grouping loop rather than rewriting it.

Delete `RECORD_HEADER`, the record-building loop, and the turn grouping that
existed only to separate prose from records.

- [ ] **Step 4: Verify and commit**

Expected: **1213**. Commit as `fix: replay shared-session tool calls natively`.

The body must name the two sentences this reverses, both quoted in
`docs/superpowers/specs/2026-08-27-narrated-tool-calls-recurrence-design.md`.

---

### Task 3: Remove the note that explained the format

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('does not tell a shared session about a record format it no longer sees', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    await manager.send('a1', 'go')
    expect(llmSystems[0]).not.toContain('Session log')
  })
```

If this passes before the change, the note is not reaching a plain `send` —
check whether `sendInSession` is the only path that sets an execution before
believing the test.

- [ ] **Step 2: Run to confirm failure**

- [ ] **Step 3: Implement**

Delete `SHARED_SESSION_RECORD_NOTE` and drop it from `systemSuffix`, leaving:

```ts
      systemSuffix: () => this.coordinatorNote(agent.id),
```

- [ ] **Step 4: Verify and commit**

Expected: **1214**. Commit as `chore: drop the note explaining a format that is gone`.

---

### Task 4: The detector becomes a net

**Files:**
- Modify: `src/shared/narrated-tool-call.ts`
- Test: `tests/unit/neutral-context.test.ts` (the detector tests live here)

- [ ] **Step 1: Write the failing test**

```ts
  it('recognises the record body without its header', () => {
    // What actually happened: the model copied the body and dropped the header,
    // which is the natural half to copy — the header says in words that it is
    // not a format to reproduce.
    expect(looksLikeNarratedToolCall(
      '- read · completed\n  input: {"file_path":"a.ts"}\n  output: ok'
    )).toBe(true)
  })

  it('does not fire on a list item that merely names a tool', () => {
    expect(looksLikeNarratedToolCall('- read the file first\n- then edit it')).toBe(false)
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the first fails — both current alternatives require a header.

- [ ] **Step 3: Implement**

```ts
// Anchored on the record body, because that is the half a model reproduces.
// The header says in words that it is not a format to copy, so it is the half
// left behind. The old `[Tool … ] / Input:` alternative described a format that
// has not existed since v1.1.6 and is gone.
const NARRATED = /^(?:\[Session log[^\]\n]*\]\s*\r?\n- |- [a-z][\w-]* · (?:completed|failed)\s*\r?\n\s+input:)/m
```

Keep the `[Session log …]` alternative: a message reproducing the header is
narration too, and old transcripts still contain the format.

- [ ] **Step 4: Verify and commit**

Expected: **1216**. Commit as `fix: detect the half of the record a model actually copies`.

---

### Task 5: Documentation, verification, report

- [ ] **Step 1: Correct the record**

`docs/superpowers/specs/2026-08-25-narrated-tool-calls-design.md` — annotate,
do not delete, the two sentences the new spec quotes: that the flattening was
necessary, and that single-agent chat is unaffected. Point at the new spec.

`docs/design/02-agent-runtime.md` — describe what compilation now produces, and
that both paths emit the same shape.

`docs/technical-debt.md` — item 8 exists for design sentences that are not true.
Add this as its third recorded instance.

- [ ] **Step 2: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 3: Full verification**

```bash
npm test && npm run typecheck && npm run build
```

- [ ] **Step 4: Run the app — the step this plan cannot skip**

Isolated dev profile, port 1305 checked free first.

1. Open a project with an **Antigravity** account and take at least two turns
   that use tools, so the third turn replays them.
2. Take a third turn. It must complete without a provider error.
3. Repeat on the **ChatGPT** account.
4. Confirm no message in the new turns carries the record shape.

If Antigravity refuses the replayed calls, **stop and report**. A per-provider
workaround is a design change and is not authorised by this plan.

- [ ] **Step 5: Report and stop**

Do not merge, tag or push. Report each task with its test count, and the result
of step 4 separately — it is the one thing tests cannot answer.
