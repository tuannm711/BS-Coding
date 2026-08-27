# Chat Scroll Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Scrolling down during a streaming turn stops freezing the transcript.

**Architecture:** One predicate loses its second argument and its second clause.
Its only call site drops the measurement that fed it.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- Test baseline: **158 files, 1214 tests**.
- **Change nothing else in the scroll controller.** The spec lists what stays:
  key handling, touch, pointer, scrollbar drag, the tail spacer, the anchor,
  `reconcile`, the three-mode model, and the 80px follow zone used elsewhere.
  A tidy-up here is the next regression.
- Do not tag, bump the version, or merge.
- `fix/chat-scroll-wheel` stays the only side branch.

---

### Task 1: Downward wheel movement never takes ownership

**Files:**
- Modify: `src/renderer/src/components/chat/chat-scroll-geometry.ts`,
  `src/renderer/src/components/chat/useChatScroll.ts`
- Test: `tests/unit/chat-scroll-geometry.test.ts`

- [ ] **Step 1: Rewrite the test that states the defect as the intent**

The existing test is why the suite stayed green. Replace it — do not delete it —
and keep the reason next to it:

```ts
  it('takes manual ownership only when the reader scrolls away', () => {
    // Scrolling *away* is upward. This used to also fire on downward movement
    // unless the feed was within 1px of the bottom — and during a streaming
    // turn the tail spacer means it never is, so one wheel tick down froze the
    // transcript until Scroll to end. The scroll spec's own words: "when the
    // user deliberately scrolls away from the follow zone".
    expect(shouldEnterManualForWheel(-1)).toBe(true)
    expect(shouldEnterManualForWheel(1)).toBe(false)
    expect(shouldEnterManualForWheel(0)).toBe(false)
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/chat-scroll-geometry.test.ts
```

Expected: a type error or arity failure — the function still takes two
arguments. If it passes, stop and find out why before continuing.

- [ ] **Step 3: Implement**

`chat-scroll-geometry.ts`:

```ts
// Upward only. Scrolling down moves toward the content the feed is trying to
// show; treating it as intent to take over froze the transcript, because during
// a streaming turn the tail spacer keeps the feed off the exact bottom and the
// old rule required being within 1px of it.
export function shouldEnterManualForWheel(deltaY: number): boolean {
  return deltaY < 0
}
```

`useChatScroll.ts`, at the one call site — `atScrollEnd` has no other reader, so
it goes with the argument:

```ts
  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    trustedInteractionRef.current = true
    if (shouldEnterManualForWheel(event.deltaY)) enterManual()
  }, [enterManual])
```

Leave `isAtBottom` alone: it is used elsewhere, and removing it would be a
change nobody asked for.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1214**, unchanged — one test rewritten, none added or removed.
Commit as `fix: scrolling down no longer freezes the chat transcript`.

The body must name `7b7d791` as where the rule came from, and say that its test
stated the defect as the intent.

---

### Task 2: Verify in the app, and record

- [ ] **Step 1: Run the app**

Isolated dev profile, port 1305 checked free first.

1. Send a message that produces a long streaming answer.
2. **Scroll down with the wheel while it streams** — the view keeps following.
3. **Scroll up** — following stops and **Scroll to end** appears.
4. Press **Scroll to end** — following resumes.
5. **The risk from the spec:** a turn that spawns a subagent. Scroll down while
   its output streams and confirm the scroll is still released as `7b7d791`
   intended — that commit tightened this rule for exactly that case, and its
   release came from scrolling *up*, which is untouched. If it regressed, stop
   and report rather than widening the fix.

- [ ] **Step 2: Record it**

Annotate `docs/superpowers/specs/2026-08-24-codex-chat-scroll-design.md` — or
whichever file carries the scroll spec — with what the wheel rule now is and
why, pointing at the new spec. Do not rewrite the original: the reversal is the
record.

`docs/technical-debt.md` item 8 collects design sentences that were not true.
This is a test that was not true, which is the same failure wearing a different
hat; add it there.

- [ ] **Step 3: Report and stop**

Do not merge, tag or push. Report the test count and step 1's result — in
particular point 5, which tests cannot answer.
