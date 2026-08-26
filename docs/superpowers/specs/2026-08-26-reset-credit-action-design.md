# Spending a ChatGPT reset credit — design

Date: 2026-08-26
Branch: `feat/reset-credit-action`
Closes: `docs/technical-debt.md` item 10

## Problem

`ProviderUsage.resetCredits` is read and shown, and nothing spends one. The
badge tells a user they hold a credit and offers no way to use it, so the trip
to the web is still required — the friction this group of work exists to remove.

The blocker was the endpoint. It is now known: the owner's fork of the cockpit
tool at `tuannm711/BS-AI-Tools` is open source and implements this.

## What cockpit does, read from its source

```
POST https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume
body: { "redeem_request_id": "<uuid v4>" }
```

Headers are the set `fetchUsage` already sends — `Bearer`, `originator`,
`user-agent`, `referer`, `ChatGPT-Account-Id` — plus
`content-type: application/json`.

**The retry reuses the same `redeem_request_id`.** On 401 cockpit refreshes the
token and posts again with the id generated before the first attempt:

```rust
let redeem_request_id = uuid::Uuid::new_v4().to_string();
match post_reset_credit_once(&account, &redeem_request_id).await {
    Err(error) if is_unauthorized_error(&error) => {
        refresh_account_tokens(...).await?;
        post_reset_credit_once(&account, &redeem_request_id).await
    }
```

Generating a fresh id on the retry would spend two credits. This is the single
easiest thing to get wrong here.

Cockpit also confirms with the user before posting, and refreshes the account
afterwards — with a distinct error path for the case where the credit was spent
but the refresh then failed.

## What a reset credit actually does

It resets the account's **whole weekly quota and the 5-hour window**, not the
5-hour window alone. Cockpit's success message names only the 5-hour window,
which is what led to a wrong reading of it during investigation; the owner
corrected it.

That is what makes the guard below necessary rather than cosmetic.

## The guard

The button is available only when **both** hold:

1. `resetCredits.available > 0`
2. The account's weekly window has less than **5%** remaining

The second is the owner's requirement. A credit is scarce — one account has
exactly one — and spending it while most of the week's quota is still unused
throws away nearly all of its value.

The weekly window is found by `kind === 'weekly'` among `usage.quotaGroups`,
which `openAiWindow` sets for a 10080-minute window. `secondaryUsedPercent` is
not used: it happens to hold the same number today but says nothing about which
window it came from.

**When the weekly figure is unknown the button stays disabled.** A guard that
cannot be evaluated has not been satisfied. `usageKnown` false or
`remainingPercent` undefined both count as unknown.

**The guard is enforced in the main process, not only in the UI.** A disabled
button is a courtesy; the IPC channel can be called regardless, and this action
cannot be undone. The renderer mirrors the same rule so the reason is visible
before the click.

## Correcting what shipped this morning

The badge currently reads `1 reset · not usable now` when
`applicable_available_count` is 0. That wording asserts a meaning for a field
this design cannot support: **cockpit ignores `applicable_available_count`
entirely** — it appears nowhere in its source — and gates on `available_count`
alone.

Since the tool that performs the action successfully does not consult that
field, the wording is dropped. The badge states the count and nothing more. The
inference was mine and it was not sound.

## Approach

**`ProviderAdapter.consumeResetCredit?(account, secret): Promise<void>`.** Only
the OpenAI adapter implements it. It reuses the header builder and the
refresh-on-401 path already in `fetchUsage`, and keeps the `redeem_request_id`
across the retry.

**`ConnectionsManager.consumeResetCredit(providerId, accountId)`** checks the
guard, calls the adapter, then refreshes the account. It returns a result that
distinguishes three outcomes: refused by the guard, the post failed, the post
succeeded but the refresh afterwards failed. The third is not a failure of the
action and must not read as one — the credit is gone either way.

**A confirmation step in the renderer** stating what will happen: one credit
spent, not reversible, weekly and 5-hour quota both reset.

## Verification

1. The adapter posts to the consume URL with a `redeem_request_id`, and on a
   401 posts again **with the same id**, driven by a stubbed fetch that records
   both bodies.
2. The guard refuses when `available` is 0, when weekly remaining is 5% or more,
   and when the weekly figure is unknown — each asserted separately.
3. The guard admits when `available > 0` and weekly remaining is under 5%.
4. A successful consume followed by a failed refresh reports as consumed, not
   as failed.
5. The badge no longer contains the string `not usable now`.
6. `npm test` and `npm run typecheck` pass.
7. In the running app, the button is disabled for an account at 69% weekly
   remaining, and the reason is visible.

Note what verification 7 does **not** cover: no test in this repository can
prove the endpoint works, because proving it means spending the owner's only
credit. That is their call, not this plan's.

## Risks

**A wrong guard boundary wastes a credit.** The comparison is strict: under 5%,
not 5% or under. At exactly 5% the button stays disabled. Being one step too
cautious costs nothing; being one step too loose costs an unrecoverable credit.

**The endpoint may behave differently from cockpit's use of it.** The protocol is
read from working source, not from documentation. If the response shape differs
the failure is visible and the credit is spent — which is why the first real use
should be the owner's, deliberately.

**`applicable_available_count` is still unexplained.** It is 0 on all three
measured accounts while `available` is 1 on two of them. Dropping the wording
does not explain the field; it stops asserting something unsupported. If a
consume is ever refused while `available > 0`, that field is the first suspect.

## Out of scope

**The dedicated `GET .../rate-limit-reset-credits` endpoint**, which returns
`{ available_count, credits[], next_expires_at }`. Richer than what `usage`
embeds — `next_expires_at` implies credits expire — but the embedded read is
sufficient for this work and adds no request.

**Automatic spending.** A credit is never spent without a click.

## Success criteria

A reset credit can be spent from the quota card when the guard admits it,
without a trip to the web. The guard holds in the main process. Nothing about
the badge claims a meaning the evidence does not support.
