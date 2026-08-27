# Scrolling down should not freeze the chat — design

Date: 2026-08-27
Branch: `fix/chat-scroll-wheel`

## Symptom

The transcript stays at one position while a turn streams. Only the
**Scroll to end** button moves it. Reported as a recurrence of an older problem.

## Cause

`shouldEnterManualForWheel` puts the feed into `manual` on any wheel movement
that is not downward at the exact bottom:

```ts
export function shouldEnterManualForWheel(deltaY: number, atScrollEnd: boolean): boolean {
  return deltaY < 0 || !atScrollEnd
}
```

`atScrollEnd` is measured at the call site as within **1px** of the true bottom:

```ts
const atScrollEnd = feed !== null && feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 1
```

While a turn streams there is a **tail spacer** below the content — it exists so
the anchored turn can stay near the top while the answer grows into the space.
So the feed is essentially never within 1px of the bottom during a turn, and one
downward wheel tick is enough to enter `manual`.

`manual` is terminal for automatic scrolling: `reconcile` returns on its first
line while in it, and only `jump-end` or returning to the bottom follow zone
leaves it. Hence a frozen view that only the button recovers.

## This came from an earlier fix, and the test pins it

`7b7d791` — *"fix: release chat scroll during subagent streaming"*, 2026-08-24 —
replaced an 80px follow-zone check with the 1px exact-bottom one:

```diff
-    if (event.deltaY < 0 || !isAtBottom()) enterManual()
+    const atScrollEnd = feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 1
+    if (shouldEnterManualForWheel(event.deltaY, atScrollEnd)) enterManual()
```

It was making manual takeover *easier*, deliberately, to release the scroll
during subagent streaming. It overshot: it made following practically impossible
to keep once the wheel is touched at all.

The suite stayed green because the test states the defect as the intent:

```ts
it('treats wheel movement as manual intent unless it is downward at the exact bottom', () => {
  expect(shouldEnterManualForWheel(1, false)).toBe(true)
})
```

And it contradicts the scroll spec's own wording — *"Stop all forced scrolling
when the user deliberately scrolls **away** from the follow zone"*. Scrolling
down is not scrolling away.

## Approach

**Downward wheel movement never takes manual ownership.**

```ts
export function shouldEnterManualForWheel(deltaY: number): boolean {
  return deltaY < 0
}
```

Scrolling up is scrolling away, and takes ownership as it always has. Scrolling
down moves toward the content the feed wants to show; at worst it is a no-op,
and it can no longer trap the reader in a frozen view.

`atScrollEnd` becomes unused at this call site and its computation goes with it.

**What this does not change**, because it was not asked for and is working:

- `shouldEnterManualForKey` — `ArrowDown`/`PageDown`/space already only take
  ownership when *not* at the bottom, and the keyboard has no equivalent trap
  because those keys move the view themselves.
- Touch, pointer and scrollbar-drag handling.
- The tail spacer, the anchor, `reconcile`, and the three-mode model.
- The 80px follow zone used elsewhere to decide when following resumes.

## Verification

1. `shouldEnterManualForWheel(-1)` is `true` — scrolling up still takes over.
2. `shouldEnterManualForWheel(1)` is `false`, whatever the scroll position.
3. The test that stated the old rule is rewritten rather than deleted, with the
   reason beside it.
4. `npm test`, `npm run typecheck`, `npm run build`.
5. In the app: during a long streaming turn, scroll down with the wheel and the
   view keeps following; scroll up and it stops, with **Scroll to end** offered.

## Risks

**A downward wheel while reading far above no longer registers as intent.** It
does not need to — the reader is already in `manual` from the upward scroll that
got them there, and this only governs *entering* it.

**Subagent streaming was the reason for the original tightening.** If releasing
the scroll during subagent output depended on downward wheel entering manual,
that behaviour changes. Reading `7b7d791`, the release it wanted came from
scrolling *up* out of the follow zone, which is untouched — but this is the risk
to watch when checking step 5.

## Out of scope

Anything else in the scroll controller. The report was one symptom with one
cause; touching the anchor, the spacer or the key handling to "improve while
here" is what turns a fix into the next regression.

## Success criteria

A reader can scroll down during a streaming turn without the transcript
freezing, and **Scroll to end** stops being the only way back.
