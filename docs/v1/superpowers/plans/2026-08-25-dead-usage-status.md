# Dead `ProviderUsage.status` Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Narrow `ProviderUsage.status` from four values to the two that
consumers actually distinguish, without changing any observable behaviour.

**Architecture:** Update the tests to the target behaviour first, then narrow the
union in `src/shared/types.ts` and let the compiler enumerate every producer that
still assigns a removed value. Typecheck is the completeness gate, not grep.

**Tech Stack:** TypeScript across four tsconfig projects, vitest.

## Global Constraints

- The target type is exactly `status: 'ok' | 'unavailable'`.
- Do not touch any of the five consumer sites. They already branch only on
  `'unavailable'` and must keep doing exactly that:
  `manager.ts:435`, `manager.ts:437`, `manager.ts:449`,
  `RightPanelQuota.tsx:38`, `ProvidersTab.tsx:41`.
- Delete the threshold expressions outright. Do not preserve `>= 90`, `<= 20` or
  `<= 0.2` in comments.
- Do not rename `unavailableReason`. The odd pairing of `status: 'ok'` with
  `unavailableReason` is documented in the spec as accepted.
- Do not remove `primaryUsedPercent`, `subscriptionExpiresAt`, or any
  `quotaGroups` field. Those carry the information the removed statuses implied.
- Test baseline: 141 test files, 964 tests passing. This plan replaces one test
  and edits two assertions, so the target stays **964**.
- Do not tag or bump the version. This branch merges without a release.

---

### Task 1: Narrow the union and fix every producer

**Files:**
- Modify: `tests/unit/connections-usage.test.ts:29-31`
- Modify: `tests/unit/antigravity-error-classification.test.ts:62,72`
- Modify: `src/shared/types.ts:367`
- Modify: `src/main/connections/usage.ts:46-57`
- Modify: `src/main/providers/adapters/antigravity.ts:208`
- Modify: `src/main/providers/antigravity-models.ts:115,158`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProviderUsage.status` typed `'ok' | 'unavailable'`. Task 2 confirms
  the running app is unaffected.

- [ ] **Step 1: Point the tests at the target behaviour**

In `tests/unit/antigravity-error-classification.test.ts`, change both
assertions from `status: 'near-limit'` to `status: 'ok'`:

```ts
    expect(usage).toMatchObject({ status: 'ok', unavailableReason: 'Quota exhausted' })
```

```ts
    expect(usage).toMatchObject({ status: 'ok', unavailableReason: 'Model capacity exhausted' })
```

In `tests/unit/connections-usage.test.ts`, replace the threshold case entirely.
Delete this:

```ts
  it('marks usage near limit at 90 percent', () => {
    expect(normalizeUsage({ accountId: 'a', tokensUsed: 90, tokenLimit: 100, refreshedAt: 1 }).status).toBe('near-limit')
  })
```

and put this in its place:

```ts
  it('defaults status to ok when the caller does not supply one', () => {
    expect(normalizeUsage({ accountId: 'a', tokensUsed: 90, tokenLimit: 100, refreshedAt: 1 }).status).toBe('ok')
    expect(normalizeUsage({ accountId: 'a', refreshedAt: 1, status: 'unavailable' }).status).toBe('unavailable')
  })
```

- [ ] **Step 2: Run the two files to confirm they fail**

```bash
npx vitest run tests/unit/connections-usage.test.ts tests/unit/antigravity-error-classification.test.ts
```

Expected: 3 failures — two receiving `'near-limit'` where `'ok'` is expected, and
the `normalizeUsage` default receiving `'near-limit'` because the 90 percent
threshold still fires.

- [ ] **Step 3: Narrow the union**

In `src/shared/types.ts`, change line 367 from:

```ts
  status: 'ok' | 'near-limit' | 'expired' | 'unavailable'
```

to:

```ts
  status: 'ok' | 'unavailable'
```

- [ ] **Step 4: Let the compiler list the producers**

```bash
npm run typecheck
```

Expected: FAIL, reporting assignments in `src/main/connections/usage.ts`,
`src/main/providers/adapters/antigravity.ts` and
`src/main/providers/antigravity-models.ts`. Record the list — it must match the
three files in Step 5. If the compiler names a file not listed there, stop and
report rather than editing it, because the spec's site survey was incomplete.

- [ ] **Step 5: Fix the producers**

In `src/main/connections/usage.ts`, replace the whole `normalizeUsage` body. The
four locals exist only to feed the threshold, so they go with it:

```ts
export function normalizeUsage(input: Partial<ProviderUsage> & Pick<ProviderUsage, 'accountId'>): ProviderUsage {
  return {
    ...input,
    refreshedAt: input.refreshedAt ?? Date.now(),
    source: input.source ?? 'provider',
    status: input.status ?? 'ok'
  }
}
```

In `src/main/providers/adapters/antigravity.ts:208`, 429 keeps meaning "we got a
real answer, so do not treat this as unavailable":

```ts
          status: result.response.status === 429 ? 'ok' : 'unavailable',
```

In `src/main/providers/antigravity-models.ts:115`:

```ts
    status: 'ok',
```

In `src/main/providers/antigravity-models.ts:158`, the status appears inline in a
long returned object literal. Change only `status: remaining <= 0.2 ? 'near-limit' : 'ok'`
to `status: 'ok'` and leave every other property on that line untouched.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no diagnostics from any of the four projects. This is the completeness
gate — a clean run proves no assignment of a removed value survives anywhere.

- [ ] **Step 7: Confirm the strings are gone**

```bash
grep -rn "near-limit" src/ tests/ ; echo "exit=$?"
```

Expected: no matches, `exit=1`.

- [ ] **Step 8: Full suite**

```bash
npm test
```

Expected: `Test Files 141 passed (141)` and `Tests 964 passed (964)`.

- [ ] **Step 9: Commit**

Stage the type, the three producers and the two test files. Subject:

```
refactor: narrow ProviderUsage.status to the values consumers read
```

Body: every branch on the field tested only for `'unavailable'`, so `'ok'`,
`'near-limit'` and `'expired'` were indistinguishable to all five consumers and
the latter two were written but never read. The three thresholds producing
`'near-limit'` disagreed with each other at `>= 90`, `<= 20` and `<= 0.2`. The
percentage remains in `primaryUsedPercent` and the quota windows, and subscription
expiry remains in `subscriptionExpiresAt`. End with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 2: Confirm the running app is unchanged

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: the narrowed type from Task 1.
- Produces: evidence that quota rendering and provider status are unaffected.

- [ ] **Step 1: Launch**

```bash
npm run dev
```

Expected: the log reaches `starting electron app...` with no `ERROR` lines.

- [ ] **Step 2: Confirm quota still refreshes and renders**

Wait for the startup usage poll, then read the store:

```bash
node -e "const a=require('fs').readFileSync('C:/Users/brads/AppData/Roaming/bs-coding/connections/accounts.json','utf8');for(const c of JSON.parse(a).connections||[])for(const x of c.accounts||[])console.log(c.providerId, x.usage?.status, x.usage?.unavailableReason||'-')"
```

Expected: every account reports `ok` — never `near-limit`, never `expired` — and
no account that previously refreshed cleanly now reports `unavailable`.

- [ ] **Step 3: Confirm the provider card still reads Ready**

Open Settings → Providers. The status badge must still read `Ready` and the quota
group cards must still show their percentages. This is the behaviour the spec
claims is preserved.

- [ ] **Step 4: Stop the app and report**

Do not merge, tag, bump the version, or push. Report both tasks and wait for the
final approval gate. Merge is handled after that gate with the
`superpowers:finishing-a-development-branch` skill, and this branch merges
without a release tag.
