# Quota card accuracy — design

Date: 2026-08-25
Branch: `fix/quota-card-accuracy`
Release: v1.1.4, together with the tray icon fix and the status narrowing already on `master`

Four reported problems with the quota cards.

These are not cosmetic. BS Coding's purpose is to drive many accounts across many
providers inside one coding session, so quota is the input that decides which
account can take the next turn. A group-scoped exhaustion promoted to account
level (item 2) is a routing defect, not a display nicety.

---

## 1. Subscription expiry

**Reported:** the card reads "Subscription expiry not reported"; it should show a
term like `Term 24d · 2026-09-18 12:47`, for ChatGPT and other providers, not
only Antigravity.

### Where the reference number comes from

The reference badge belongs to a **ChatGPT Plus** account, not Antigravity. The
locally installed comparison tool stores, in plaintext in its own backup:

```json
"api_provider_mode": "openai_builtin",
"plan_type": "plus",
"subscription_active_until": "2026-09-18T05:47:59+00:00"
```

`05:47:59Z` is `12:47:59` at UTC+7, matching the badge exactly.

### That tool uses the same authentication BS Coding already uses

Its account records carry `auth_mode: oauth` and
`tokens: { id_token, access_token, refresh_token }` — the same three tokens BS
Coding holds. There is no web session cookie and no broader credential. The
capability gap is not an authentication-model gap.

What it has that BS Coding does not:

| Field | BS Coding today |
|---|---|
| `account_id` (populated) | empty on the user's accounts |
| `organization_id` | never extracted |
| `subscription_query_last_attempt_at` | no separate tracked query |

### Why BS Coding never gets the field

`extractOpenAISubscriptionMetadata` in `src/main/connections/usage.ts:121`
already searches for `subscription_active_until`. It is never reached. Measured
against the running app, `fetchSubscriptionMetadata` produces:

```
accounts/check/v4-2023-04-27   status=403   hasAccountId=false
```

Two independent causes:

1. `accounts/check/v4-2023-04-27` returns **403** to a Codex OAuth bearer.
2. `secret.accountId` is empty, so
   `/backend-api/subscriptions?account_id=…` sits behind `if (accountId)` in
   `src/main/providers/adapters/openai.ts:143` and is **never called**.

`fetchSubscriptionMetadata` therefore returns `{}` for every account. The
`plan=plus` visible on the cards comes from the usage payload, not from this
function.

An earlier reading of this code blamed the early `return` on partial metadata.
Measurement disproved that: the first endpoint never succeeds, so the early
return never fires.

### Approach

`accountId` is recoverable. `decodeJwtProfile` in
`src/main/connections/codex.ts:59` already reads `account_id` from the
`https://api.openai.com/auth` claim, and `idToken` is stored in secrets. It runs
only at fresh OAuth login, which is why accounts imported from a Codex auth file
lack the field.

Three changes:

1. In `fetchUsage`, when `secret.accountId` is missing, recover it from
   `decodeJwtProfile(secret.idToken)` and persist it with the refreshed secret.
2. Extend `decodeJwtProfile` to also return `organizationId` from the same claim,
   and carry it on the secret.
3. In `fetchSubscriptionMetadata`, merge metadata across all endpoints and stop
   only once both `planName` and `subscriptionExpiresAt` are found, rather than
   returning on the first partial hit.

Then **measure** whether `/backend-api/subscriptions` returns
`subscription_active_until` for a Codex token. It cannot be measured before
change 1, because the endpoint is currently unreachable.

If it returns the field, the expiry renders as `Term 24d · 12:47:59 18/09/2026`.
If it returns 403 as well, that is reported with the evidence and the fallback
line stays. No term is fabricated from a tier id.

The comparison tool populates `subscription_active_until` on only three of its
six account records and tracks `subscription_query_last_attempt_at`, which
suggests the query fails or is throttled some of the time. The rendering must
therefore treat a missing expiry as normal, not as an error.

### What this cannot fix

**Antigravity has no expiry to report.** Every key returned by `loadCodeAssist`
was captured: `cloudaicompanionProject`, `gcpManaged`, `currentTier`, `paidTier`,
`allowedTiers` and their children. No expiry, term, renewal or end-date field
exists anywhere in it. The comparison tool shows no term for Antigravity either.

**GitHub Copilot and openai-compatible report no usage at all.** Only
`antigravity.ts` and `openai.ts` implement `fetchUsage`, so those providers have
no quota or expiry surface to populate. That is a current design limit, not a bug
in scope here.

`planName` was also checked while confirming this. It resolves as
`paidTier?.id ?? currentTier?.id` → `g1-pro-tier` while `currentTier.id` is
`free-tier`. That is correct: `paidTier` is the subscription actually held, its
own upsell text offers Ultra as the next step up, and the comparison tool also
reports PRO. No change.

---

## 2. "Quota exhausted" on an account that still has quota

**Reported:** the card shows `Quota exhausted` and a `Cooldown` badge while the
Gemini group reads 94.1% and 99.23% remaining.

**Finding:** the same defect pattern as the `primaryUsedPercent` bug fixed in
v1.1.2 — a fact true of one group promoted to the whole account.

The 429 came from the `claude-gpt` group, whose weekly window sits at 0.1%. The
adapter stores `unavailableReason: 'Quota exhausted'` at account level, and two
consumers read it with no notion of which group earned it:

- `src/renderer/src/components/quota/QuotaAccountCard.tsx:74` prints the string
  unconditionally.
- `src/renderer/src/components/RightPanelQuota.tsx:33-34` matches the same string
  to return `cooldown`, and `:35` to return `quota-exhausted`.

So a group at 94% inherits a sibling group's warning. Under the multi-account
routing goal this is the most consequential of the four items: an orchestrator
reading that state would skip an account that is fully usable for Gemini work.

**Approach:** fix at the display layer. An account-level exhaustion warning is
suppressed when at least one quota window still reports remaining quota above
zero. When every window is exhausted, the warning shows exactly as today. The
per-group cards keep their own `exhausted` and `cooldown` states either way.

Attaching the responsible group to the reason would be more precise, but it
changes `ProviderUsage`, every adapter that produces a reason, and both
consumers. Larger change, smaller gain, out of scope here.

---

## 3. Missing request count in the chat panel

**Reported:** the request count is gone from the four-metric row; please restore
it.

**Finding, stated plainly:** it was never there. `git log -S"Requests"` on the
card component returns only the commit that created the feature. Two components
render two different rows:

| Variant | Component | Metrics |
|---|---|---|
| `provider` (Settings) | `ProviderMetrics` | **Requests**, Token in, Token out, Estimated |
| `chat` (right panel) | `SessionMetrics` | Token in, Token out, Estimated |

`RightPanelQuota.tsx:121` does not pass `tracked` to the card, so the chat panel
has never had a request count to show.

The request is sound and the data exists. `ProviderTrackedUsage.requests` is
aggregated per reset period by `selectTrackedPeriod` in
`src/main/connections/usage.ts:24`, which keys the period off the weekly or
longest quota window — exactly "requests counted within the latest reset window".

**Approach:** pass `tracked` through to the chat variant and give
`SessionMetrics` a Requests metric sourced from it. Session token counts stay
live from agent telemetry; the request count comes from the tracked period. The
row keeps its "Session estimate" label and reads
`Requests · Token in · Token out · Estimated`.

With no tracked period yet, Requests renders `—`, matching how `formatCount`
already handles absent values.

---

## 4. Next reset as an absolute instant

**Reported:** show the exact reset date and time in 24-hour `HH:mm:ss DD/MM/YYYY`
instead of a countdown.

**Finding:** `QuotaAccountCard.tsx` renders
`Next reset · ${formatCountdown(window.resetAt)}` → `4d 20h`.

**Approach:** show both, countdown first, then the instant:
`Next reset · 4d 20h · 19:09:02 25/08/2026`.

A new `formatInstant(timestamp)` helper in `quota-view.ts` renders local time as
`HH:mm:ss DD/MM/YYYY`, zero-padded, 24-hour. It serves both this and the expiry
line in item 1, so the two stay consistent.

---

## Verification

1. `formatInstant` returns `19:09:02 25/08/2026` for a known epoch in local time,
   zero-padded on single-digit fields.
2. A quota window with a `resetAt` renders both countdown and instant; one
   without still renders "Reset not reported".
3. An account whose reason says "Quota exhausted" but which has at least one
   window above zero does **not** show the account-level warning; an account
   whose windows are all at zero still does.
4. `quotaAccountState` no longer returns `cooldown` or `quota-exhausted` for an
   account with remaining quota in some window.
5. The chat variant renders four metrics including Requests.
6. `decodeJwtProfile` returns `accountId` and `organizationId` from a claim
   fixture, and `{}` for a malformed token.
7. `fetchSubscriptionMetadata` queries every endpoint until both fields are
   found, rather than returning on the first partial result.
8. With the app running, the subscription endpoint trace shows
   `hasAccountId=true` and the `/backend-api/subscriptions` call being attempted.
   Its outcome is reported either way.
9. `npm test` and `npm run typecheck` pass.

## Risks

**Suppressing the warning hides a real problem.** If every window is exhausted
the warning still shows, and per-group cards keep their own states. Only the
account-level line is gated.

**The recovered `accountId` is wrong or stale.** It comes from the same claim the
login path uses, so a wrong value would also have been wrong at login. The
endpoint returns an error rather than another account's data.

**`/backend-api/subscriptions` also rejects the Codex token.** Then item 1
delivers no expiry. Verification step 8 makes that outcome explicit instead of
silent.

## Out of scope

**Attaching the responsible group to `unavailableReason`.** See item 2.

**A designed quota-health signal for routing.** The accidental one was removed on
`master` for having three disagreeing thresholds and no readers. The orchestrator
feature will need a deliberate one, chosen against routing requirements.

**Adding a tests tsconfig.** Test files are typechecked by nothing today, which
is how a stale union value survived in a fixture on the previous branch. Real,
and its own task.

## Success criteria

Items 2, 3 and 4 are visibly fixed in the running app. Item 1 reaches the
subscription endpoint with a recovered `accountId`, and its result — expiry
rendered, or the endpoint refusing — is reported with evidence. Antigravity is
documented as having no expiry to report. Tests and typecheck pass; the branch
merges and ships in v1.1.4.
