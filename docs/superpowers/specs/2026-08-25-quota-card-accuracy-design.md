# Quota card accuracy — design

Date: 2026-08-25
Branch: `fix/quota-card-accuracy`
Release: v1.1.4, together with the tray icon fix and the status narrowing already on `master`

Four reported problems with the quota cards. Three are fixable as reported. One
is blocked by the provider, and this spec says so rather than inventing data.

---

## 1. Subscription expiry

**Reported:** the card reads "Subscription expiry not reported" for Antigravity;
it should show a term like the reference badge `Term 24d · 2026-09-18 12:47`.

**Finding:** `subscriptionExpiresAt` is populated only for OpenAI, in
`src/main/connections/usage.ts:108` and `src/main/providers/adapters/openai.ts:125`.
Antigravity never sets it.

To find out whether it *could*, the `loadCodeAssist` response was captured from
the running app. Every key it returns:

```
cloudaicompanionProject   gcpManaged
currentTier{id,name,description,privacyNotice,upgradeSubscription*}
paidTier{id,name,description,availableCredits,upgradeSubscription*}
allowedTiers[]{id,name,description,isDefault,privacyNotice,usesGcpTos,…}
```

**There is no expiry, term, renewal or end-date field anywhere in the response.**
The only keys matching a date-like search were `upgradeSubscriptionUri` and
`upgradeSubscriptionText`, which are a marketing URL and its copy.

**Decision:** Antigravity keeps the existing fallback line. Fabricating a term
from `g1-pro-tier` would be inventing a number, which is worse than saying
nothing.

**What is delivered:** the OpenAI path does have real expiry data, and its
rendering is currently `formatExpiry` → `expires in 24d`, with no absolute
instant. That gets upgraded to the reference format, so accounts that report an
expiry show `Term 24d · 12:47:00 18/09/2026`.

While confirming this, `planName` was also checked. It resolves as
`paidTier?.id ?? currentTier?.id` → `g1-pro-tier`, while `currentTier.id` is
`free-tier`. That is correct, not a bug: `paidTier` is the subscription actually
held — its own upsell text offers Ultra as the *next* step up — and the external
tool the user compares against also reports PRO. No change.

---

## 2. "Quota exhausted" on an account that still has quota

**Reported:** the card shows `Quota exhausted` and a `Cooldown` badge while the
Gemini group reads 94.1% and 99.23% remaining.

**Finding:** this is the same defect pattern as the `primaryUsedPercent` bug
fixed in v1.1.2 — a fact true of one group is promoted to the whole account.

The 429 came from the `claude-gpt` group, whose weekly window sits at 0.1%. The
adapter stores `unavailableReason: 'Quota exhausted'` at account level, and two
consumers then read it without any notion of which group it belonged to:

- `src/renderer/src/components/quota/QuotaAccountCard.tsx:74` prints the string
  unconditionally.
- `src/renderer/src/components/RightPanelQuota.tsx:33-34` matches the same string
  to return `cooldown`, and `:35` to return `quota-exhausted`.

So a group at 94% inherits a warning earned by a sibling group.

**Approach:** fix at the display layer. An account-level exhaustion warning is
suppressed when at least one quota window still reports remaining quota above
zero. When every window is exhausted, the warning shows exactly as today.

The stored data is left alone. Attaching the responsible group to the reason
would be more precise, but it changes `ProviderUsage`, every adapter that
produces a reason, and both consumers — a larger change for a smaller gain, and
out of scope here.

---

## 3. Missing request count in the chat panel

**Reported:** the request count is gone from the four-metric row; please restore
it.

**Finding, stated plainly:** it was never there. `git log -S"Requests"` on the
card component returns only the commit that created the feature. Two different
components render two different metric rows:

| Variant | Component | Metrics |
|---|---|---|
| `provider` (Settings) | `ProviderMetrics` | **Requests**, Token in, Token out, Estimated |
| `chat` (right panel) | `SessionMetrics` | Token in, Token out, Estimated |

`RightPanelQuota.tsx:121` does not pass `tracked` to the card, so the chat panel
has never had a request count to show.

The request is still sound, and the data already exists.
`ProviderTrackedUsage.requests` is aggregated per reset period by
`selectTrackedPeriod` in `src/main/connections/usage.ts:24`, which keys the
period off the weekly or longest quota window. That is exactly "requests counted
within the latest reset window".

**Approach:** pass `tracked` through to the chat variant and give
`SessionMetrics` a Requests metric sourced from it. Session token counts stay
live from agent telemetry; the request count comes from the tracked period. The
two have different sources, so the row keeps the existing "Session estimate"
label and reads `Requests · Token in · Token out · Estimated`.

When no tracked period exists yet, Requests renders as `—`, matching how
`formatCount` already handles absent values.

---

## 4. Next reset as an absolute instant

**Reported:** show the exact reset date and time in 24-hour `HH:mm:ss DD/MM/YYYY`
instead of a countdown.

**Finding:** `QuotaAccountCard.tsx` renders
`Next reset · ${formatCountdown(window.resetAt)}` → `4d 20h`.

**Approach:** show both, countdown first, then the instant:
`Next reset · 4d 20h · 19:09:02 25/08/2026`. The countdown answers "how long do I
wait", the instant answers "when exactly", and the reported problem was only the
absence of the second.

A new `formatInstant(timestamp)` helper in `quota-view.ts` renders local time as
`HH:mm:ss DD/MM/YYYY`, zero-padded, 24-hour. It is used for both this and the
expiry line in item 1, so the two stay consistent.

---

## Verification

1. `formatInstant` returns `19:09:02 25/08/2026` for a known epoch in local time,
   with zero padding on single-digit fields.
2. A quota window with a `resetAt` renders both the countdown and the instant; a
   window without one still renders "Reset not reported".
3. An account whose reason says "Quota exhausted" but which has at least one
   window above zero does **not** show the account-level warning; an account
   whose windows are all at zero still does.
4. `quotaAccountState` no longer returns `cooldown` or `quota-exhausted` for an
   account with remaining quota in some window.
5. The chat variant renders four metrics including Requests.
6. `npm test` passes; `npm run typecheck` passes.
7. In the running app, the Antigravity card shows the Gemini group without a
   false exhaustion warning, and Next reset shows both forms.

## Risks

**Suppressing the warning hides a real problem.** If every window is exhausted
the warning still shows, and the per-group cards keep their own `exhausted` and
`cooldown` states either way. The account-level line is the only thing gated.

**`selectTrackedPeriod` returns a local fallback period.** When no window has a
`resetAt`, the period key is `local:<firstObserved>`, so Requests counts from
first observation rather than from a provider reset. That is pre-existing and
correct given no reset is known.

## Out of scope

**Attaching the responsible group to `unavailableReason`.** See item 2.

**Fabricating an Antigravity subscription term.** See item 1.

**Adding a tests tsconfig.** Test files are typechecked by nothing today, which
is how a stale union value survived in a fixture during the previous branch.
Real, and its own task.

## Success criteria

Items 2, 3 and 4 are visibly fixed in the running app; item 1 is delivered for
providers that report an expiry and documented as unavailable for Antigravity;
tests and typecheck pass; the branch merges and ships in v1.1.4.
