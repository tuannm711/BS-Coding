# The quota surface — design

Date: 2026-08-26
Branch: `feat/quota-surface`
Group: B in `docs/design/00-goals.md`

## Problem

Three complaints, one surface.

**Seeing a current number means opening Settings.** `refreshProviderAccount` is
called from exactly one place, `ProvidersTab.tsx:48`. The automatic poll runs
every five minutes (`src/main/index.ts:545`), so between polls the chat-side card
is up to five minutes stale with no way to ask for more.

**ChatGPT reset credits are not shown at all.** The cockpit tool displays
"Resets 1" for an account of the owner's; BS Coding shows nothing.

**A field is read that the provider never sends.** `usage.ts:104-105` parses
`value.banked?.used` and `value.banked?.limit` into `ProviderUsage.bankedUsed`
and `bankedLimit`. Nothing in the renderer reads them, and — measured below —
the endpoint does not return a `banked` object at all.

## What the provider actually returns

Measured on 2026-08-26 by a read-only GET against
`https://chatgpt.com/backend-api/wham/usage` for three of the owner's accounts.
No POST was made and no reset credit was consumed.

```
rate_limit_reset_credits.available_count             1
rate_limit_reset_credits.applicable_available_count  0
```

| Account | Plan | available | applicable |
|---|---|---|---|
| nguyenminhtuan.90vn@ | plus | 1 | 0 |
| h.ernandezrob5612@ | plus | 0 | 0 |
| nguyenminhtuan.bdg@ | free | 1 | 0 |

Two facts follow, and both shape the design:

**The field is `rate_limit_reset_credits`, not `banked`.** The shape the parser
looks for does not exist in the response. This is not a renamed field; it is a
field that has never been there in that form.

**`available` and `applicable` differ, and the difference matters.** At the time
of measurement the 5-hour window was at `used_percent: 0` — there was nothing to
reset, so the credit could not be applied. Showing only `available_count` would
offer an action that does nothing. Both numbers are shown.

The response also carries a `credits` object — `has_credits`, `unlimited`,
`balance`, `approx_local_messages`, `approx_cloud_messages` — and a
`spend_control` object. These are the **balance quota model** from
`docs/design/00-goals.md`, present on a provider already in use. They are out of
scope here and recorded as debt, because designing that model deserves its own
pass rather than being folded into a display fix.

## Approach

**A refresh control on the chat card.** `QuotaAccountCard` already takes
`onRefresh` and `refreshing`; the whole actions footer is gated behind
`variant === 'provider'` at line 106. The chat variant gets its own footer with
one button — refresh only. Reconnect, Activate and Remove stay out: the chat
frame is not where accounts are managed, and a destructive control does not
belong beside a running conversation.

Freshness is already visible in both variants at line 69 (`Updated 4m ago`, or
`Stale · …`), so nothing is added for that.

**Reset credits shown where the account is described.** A badge beside the plan
badge, reading the count and stating plainly when a credit exists but cannot be
applied. No action attached — see below.

**The dead field removed.** `bankedUsed` and `bankedLimit` go from
`ProviderUsage` and from `usage.ts`, replaced by the field the provider sends.

## Deliberately not done

**The reset action itself.** Consuming a credit needs a POST endpoint that the
usage response does not reveal. Guessing a URL risks spending the credit the
owner still has, which they asked to be left alone. Recorded as debt with its
unblocking condition stated: the endpoint, obtained by watching cockpit's own
network traffic or reading its source.

This means the badge is read-only in this pass. That is worth stating plainly
rather than implying the feature is complete.

**The balance model.** Out of scope, recorded as debt.

## Verification

1. `normalizeOpenAICodexUsage` maps `rate_limit_reset_credits.available_count`
   and `.applicable_available_count` onto `ProviderUsage`, driven by a fixture
   built from the real response captured above.
2. A response with no `rate_limit_reset_credits` yields undefined rather than
   zero — absent and none are different, and a card must not claim "0 resets"
   for a provider that does not have the concept.
3. `bankedUsed` and `bankedLimit` appear nowhere in `src/`.
4. `QuotaAccountCard` with `variant="chat"` renders a refresh button; with
   `variant="provider"` it still renders all four existing buttons.
5. The chat card renders the reset badge when a count is present, says the
   credit is not currently applicable when `applicable` is 0 while `available`
   is more than 0, and renders no badge when the field is absent.
6. Clicking refresh on the chat card calls `refreshProviderAccount` for that
   account and reflects the result without opening Settings.
7. `npm test` and `npm run typecheck` pass.
8. In the running app, the chat quota card refreshes on demand and shows
   "Resets 1" for the account that has one.

## Risks

**The badge invites a click it cannot serve.** A user seeing "Resets 1" may
expect to spend it here. The text must read as a statement of fact, not as a
control. This is the direct cost of shipping the read half without the write
half, and it is accepted because the alternative — showing nothing — is the
complaint being fixed.

**`applicable_available_count` is a guess about meaning.** The name and the
measured values support the reading that a credit applies only when a window has
usage to reset, but this is inference from one observation, not documentation.
The wording on the card says what the number is rather than asserting why.

**Refreshing from chat spends a provider request.** The same call the poll
already makes every five minutes, now also on demand. Bounded by the button
being disabled while a refresh is in flight.

## Success criteria

The chat quota card can be refreshed without opening Settings. Reset credits are
visible for the accounts that have them, with the applicable case distinguished.
No field is parsed that the provider does not send.
