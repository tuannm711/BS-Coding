# Dead `ProviderUsage.status` values — design

Date: 2026-08-25
Branch: `chore/remove-dead-near-limit`
Release: deferred — merges without a tag, ships with the tray icon fix already on `master`

## Problem

`ProviderUsage.status` is declared with four values in `src/shared/types.ts:367`:

```ts
status: 'ok' | 'near-limit' | 'expired' | 'unavailable'
```

Every branch on it in the entire codebase asks one question — is it
`'unavailable'`?

| Site | Condition |
|---|---|
| `src/main/connections/manager.ts:435` | `next.status === 'unavailable'` |
| `src/main/connections/manager.ts:437` | `next.status !== 'unavailable'` |
| `src/main/connections/manager.ts:449` | `next.status === 'unavailable' ? … : 'ready'` |
| `src/renderer/src/components/RightPanelQuota.tsx:38` | `=== 'unavailable'` |
| `src/renderer/src/components/settings/ProvidersTab.tsx:41` | `=== 'unavailable' ? 'unavailable' : 'ready'` |

Nothing under `src/main/remote/` or `server/` reads it at all.

So `'ok'`, `'near-limit'` and `'expired'` are indistinguishable to every
consumer. The type is a boolean wearing a four-value costume.

`'near-limit'` is written in four places and `'expired'` in one, and neither is
ever read. The three thresholds that produce `'near-limit'` do not even agree
with each other: `percent >= 90`, `remaining <= 20`, and `remaining <= 0.2`.

This is not a cosmetic complaint. Earlier in the session that produced this spec,
the dead field was mistaken for live behaviour and nearly became the basis for a
feature change. A value that looks meaningful and is not costs review time and
invites wrong decisions.

## Approach

Collapse the type to what consumers actually distinguish:

```ts
status: 'ok' | 'unavailable'
```

Delete the threshold expressions rather than preserving them in comments. They
disagree with one another, so none is a trustworthy starting point for a future
warning feature; a deliberate threshold should be chosen against real quota data,
not inherited from three accidental ones.

**This is provably behaviour-preserving.** Since no consumer separates `'ok'`,
`'near-limit'` and `'expired'`, mapping the latter two onto `'ok'` cannot change
what any branch does. That includes the HTTP 429 path in
`src/main/providers/adapters/antigravity.ts:208`, whose `'near-limit'` exists
only to avoid the `'unavailable'` branch — `'ok'` avoids it identically.

**No information is lost.** The percentage lives in `primaryUsedPercent` and in
`quotaGroups[].windows[].remainingPercent`. Subscription expiry lives in
`subscriptionExpiresAt`. The reason a refresh degraded lives in
`unavailableReason`. All three survive untouched.

### Sites to change

| File | Change |
|---|---|
| `src/shared/types.ts:367` | Drop `'near-limit'` and `'expired'` from the union |
| `src/main/connections/usage.ts:46-56` | `status: input.status ?? 'ok'`; delete the now-unused `limit`, `used`, `ratio` and `percent` locals |
| `src/main/providers/adapters/antigravity.ts:208` | `status: result.response.status === 429 ? 'ok' : 'unavailable'` |
| `src/main/providers/antigravity-models.ts:115` | `status: 'ok'` |
| `src/main/providers/antigravity-models.ts:158` | `status: 'ok'` |

Deleting the four locals in `normalizeUsage` is not optional cleanup: they exist
solely to compute the threshold, so leaving them would fail typecheck as unused
bindings.

### Tests to change

| File | Change |
|---|---|
| `tests/unit/antigravity-error-classification.test.ts:62` | Expect `status: 'ok'` |
| `tests/unit/antigravity-error-classification.test.ts:72` | Expect `status: 'ok'` |
| `tests/unit/connections-usage.test.ts:29-31` | Replace the threshold test with one asserting `normalizeUsage` defaults `status` to `'ok'` |

The `connections-usage` case is titled "marks usage near limit at 90 percent" and
exists only to exercise the threshold. Rewriting it to assert `'ok'` under that
name would leave a test whose name contradicts its body, so it is replaced rather
than edited.

## Known wart, deliberately not addressed

After this change a 429 response produces `status: 'ok'` together with
`unavailableReason: 'Quota exhausted'`. That reads oddly. It is not a regression:
`'near-limit'` and `unavailableReason` already coexisted on exactly that path.
Renaming `unavailableReason` to something like `statusReason` would fix the
wording, but it is a rename across every provider adapter and both renderer
consumers — a separate change with its own risk, not a rider on this one.

## Verification

1. `npm run typecheck` passes. This is the primary gate: narrowing a union makes
   the compiler find every remaining producer of the removed values, so a clean
   typecheck is proof that no `'near-limit'` or `'expired'` assignment survives.
2. `grep -rn "near-limit" src/ tests/` returns nothing.
3. `npm test` passes at 964, the current baseline. The count does not change: two
   assertions are updated in place and one test is replaced one-for-one.
4. The app launches, Settings → Providers renders quota cards, and the provider
   status badge still reads `Ready`.

## Risks

**A consumer outside the grep exists.** Mitigated by verification step 1 — after
narrowing the union, TypeScript reports every site that assigns or compares the
removed values across all four tsconfig projects.

**A future warning feature has to start from scratch.** Accepted deliberately.
The three disagreeing thresholds are not a foundation worth preserving.

## Out of scope

**Building a real quota warning.** If the project wants a badge when a group runs
low, that is a feature with its own spec: which threshold, per account or per
group, and where it appears.

**Renaming `unavailableReason`.** See the wart above.

## Success criteria

`ProviderUsage.status` is `'ok' | 'unavailable'`; typecheck and 964 tests pass;
`near-limit` appears nowhere in `src/` or `tests/`; the branch merges to `master`
without a release tag.
