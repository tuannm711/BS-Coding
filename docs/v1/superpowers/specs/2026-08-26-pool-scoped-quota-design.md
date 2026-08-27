# Pool-scoped quota state — design

Date: 2026-08-26
Branch: `feat/pool-scoped-quota`
Group: A1 in `docs/design/00-goals.md`
Closes: `docs/technical-debt.md` item 1

## Problem

A 429 from one quota pool is recorded against the whole account. On the owner's
Antigravity account right now:

```
providerError: { kind: 'quota-exhausted' }   ← stored account-wide
  group "gemini"      remainingPercent 93.74  ← healthy
  group "claude-gpt"  remainingPercent 0      ← exhausted
```

The account is flagged exhausted because Claude ran out, while Gemini on the
same account is untouched. Agent fallback (A2) reads this state to decide who
takes over; as it stands it would skip the healthy Gemini agent and report that
no fallback remains.

## Two facts the debt entry did not have

**Easier than recorded in one place.** The entry says the 429 "names the model it
was refused for… but nothing parses that", implying the model must be extracted
from the message. It does not: `recordRuntimeError` is called from inside the
`stream` closure at `manager.ts:132`, where `modelId` is already in scope. It is
simply not passed.

**Harder in the place that matters.** The model-to-pool mapping is already
broken. Measured in the owner's real `usage-ledger.json`:

```
openai       gpt-5.6-sol      quotaGroupId = openai-base
antigravity  gemini-3.6-fla   quotaGroupId = None    (425 requests)
antigravity  claude-opus-4-   quotaGroupId = None    (154 requests)
antigravity  claude-sonnet-   quotaGroupId = None    (30 requests)
```

`recordRuntimeUsage` resolves the pool with
`quotaGroups.find(group => group.modelIds.includes(modelId))`, and `modelIds` is
`[]` in the stored data. OpenAI escapes through the "exactly one group" fallback;
Antigravity has two and resolves to `undefined`.

The cause is two construction paths in `antigravity-models.ts`. The primary path
(line 92) fills `modelIds` from `bucket.modelIds ?? bucket.models ?? []`, and the
provider's buckets carry neither. The fallback path (line 156) fills it from
classified members. The owner's data came through the primary path.

`antigravityQuotaGroupForModel()` at line 74 classifies correctly and has existed
all along. Only the fallback path calls it.

**So the mapping must be fixed before an error can be scoped to a pool.** Without
it, a pool id attached to an error would be `undefined` for the provider where
pools matter most.

## Approach

**1. The adapter answers which pool a model draws from.**

```ts
ProviderAdapter.quotaGroupForModel?(modelId: string): string | undefined
```

Antigravity implements it with the existing classifier. OpenAI returns
`'openai-base'`. Both `recordRuntimeUsage` and the new error path use it, and
`group.modelIds` stops being load-bearing for lookup — it stays as descriptive
data, which is all the provider ever fills it with.

This puts provider knowledge in the provider layer and makes it testable on its
own, rather than inferring it from a field the provider leaves empty.

**2. Quota errors are stored per pool; account errors stay where they are.**

```ts
ProviderAccount.providerError    // auth, unavailable — genuinely account-wide
ProviderAccount.poolErrors?: Record<string, ProviderErrorState>   // quota, per pool
```

They are different in kind. An expired token is a fact about the account; an
exhausted pool is a fact about one family of models. Folding them into one field
means a second exhausted pool overwrites the first, and fallback needs to know
about **both**.

A record without `poolErrors` behaves exactly as today. No migration.

**3. Clearing is scoped too.** `clearRuntimeError` currently wipes the account's
error on any successful turn (`manager.ts:158`). A successful Gemini turn would
erase the record that Claude is exhausted, and the next turn would try Claude
again. Success on a pool clears that pool.

**4. The card names the exhausted pool.** Today `quotaAccountState` suppresses the
account-level warning whenever any window still has quota — correct, and the
reason the false badge was fixed in v1.1.4, but it can only say "some pool is
fine", never which one is not. With per-pool state the group row can say it.

This is included because without it A1 changes nothing a person can see, and a
change nobody can look at is a change nobody can check.

## Verification

1. `quotaGroupForModel` returns `gemini` for a Gemini model id and `claude-gpt`
   for a Claude or GPT one, driven by the ids in the owner's ledger.
2. `recordRuntimeUsage` writes a `quotaGroupId` for an Antigravity model even
   when `quotaGroups[].modelIds` is empty — the case the stored data is in.
3. A quota error records under the pool of the model that was refused, and
   leaves the other pool's entry untouched.
4. A successful turn on one pool clears that pool's error and leaves the other.
5. An account whose stored record has no `poolErrors` behaves as it does today.
6. The group row shows an exhausted state for the exhausted pool while the other
   pool on the same account still reads as healthy.
7. `npm test` and `npm run typecheck` pass.
8. In the running app, the Antigravity card shows `claude-gpt` exhausted and
   `gemini` healthy at the same time.

## Risks

**`antigravityQuotaGroupForModel` classifies by name.** It matches on substrings —
`claude`, `gpt`, a `3p-` prefix — so a future model named outside those patterns
lands in `gemini` by default. That is the existing behaviour and this work does
not make it worse, but it becomes load-bearing where it was not before. The
fallback when a model matches nothing must be "unknown", not a guess.

**Two error fields invite reading only one.** Anything asking "is this account in
trouble?" must consult both. The renderer's `quotaAccountState` is the existing
consumer and is updated; a future one could miss it.

**Existing ledger records stay unattributed.** The three Antigravity identities
with `quotaGroupId: None` are not rewritten. They age out with their period.
Rewriting stored data to fix a past mistake is how a small bug becomes a
migration.

## Out of scope

**Agent fallback.** That is A2, and it consumes what this produces.

**`statusReason`.** The debt entry proposes carrying the pool id there. It is
declined: that field means "why the last refresh degraded", not "which pool was
refused". Overloading it repeats the confusion v1.1.7 removed by renaming it.

**Rewriting `usage-ledger.json` or `accounts.json`.**

## Success criteria

A refused pool is recorded as a refused pool. An account with one exhausted pool
and one healthy pool is describable as exactly that, in the data and on the card.
The model-to-pool mapping works for Antigravity, which is where it never has.
