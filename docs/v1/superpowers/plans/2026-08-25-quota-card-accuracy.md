# Quota Card Accuracy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Make the quota cards report what is actually true, because that report
is the input that decides which account can take the next turn.

**Architecture:** Three pure helpers land first in `quota-view.ts`, then each
reported item wires one of them into a consumer. The OpenAI subscription work
comes last because its outcome cannot be known until the endpoint it needs is
reachable.

**Tech Stack:** React 19 renderer, `renderToStaticMarkup` for card tests, vitest.

## Global Constraints

- Do not change `ProviderUsage.status`. It is `'ok' | 'unavailable'` and both
  values are load-bearing.
- Do not attach a group id to `unavailableReason`. Item 2 is a display-layer fix.
- Do not fabricate a subscription term from a tier id. If the endpoint refuses,
  report the refusal.
- Gate only the two `usage.unavailableReason`-derived branches in
  `quotaAccountState`. Leave the `account.error?.kind` branches alone: an
  explicit provider error means a request was actively refused, which is a
  stronger signal than a stale reason string.
- Test baseline before any change: 141 files, **964** tests. Each task states its
  own running total; the plan ends at **979**.
- Do not tag or bump the version. This branch merges into the v1.1.4 release
  alongside work already on `master`.

---

### Task 1: Three pure helpers

**Files:**
- Modify: `src/renderer/src/components/quota/quota-view.ts`
- Modify: `tests/unit/quota-view.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatInstant(timestamp?: number): string` — `HH:mm:ss DD/MM/YYYY` local, or `—`
  - `hasRemainingQuota(usage?: ProviderUsage): boolean`
  - `accountWarning(usage?: ProviderUsage): string | undefined`

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/quota-view.test.ts`, inside the existing describe block:

```ts
  it('formats an instant as zero-padded 24-hour local time', () => {
    const stamp = new Date(2026, 7, 25, 9, 5, 2).getTime()
    expect(formatInstant(stamp)).toBe('09:05:02 25/08/2026')
    expect(formatInstant(new Date(2026, 11, 3, 19, 9, 2).getTime())).toBe('19:09:02 03/12/2026')
  })

  it('returns a dash when no instant is known', () => {
    expect(formatInstant(undefined)).toBe('—')
    expect(formatInstant(Number.NaN)).toBe('—')
  })

  it('reports remaining quota when any window is above zero', () => {
    expect(hasRemainingQuota(groupedUsage)).toBe(true)
    expect(hasRemainingQuota(undefined)).toBe(false)
  })

  it('reports no remaining quota when every window is at zero', () => {
    const drained: ProviderUsage = { ...groupedUsage, quotaGroups: groupedUsage.quotaGroups!.map(group => ({ ...group, windows: group.windows.map(window => ({ ...window, remainingPercent: 0 })) })) }
    expect(hasRemainingQuota(drained)).toBe(false)
  })

  it('hides an exhaustion warning while some group still has quota', () => {
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Quota exhausted' })).toBeUndefined()
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Model capacity exhausted' })).toBeUndefined()
  })

  it('keeps an exhaustion warning when every group is drained', () => {
    const drained: ProviderUsage = { ...groupedUsage, unavailableReason: 'Quota exhausted', quotaGroups: groupedUsage.quotaGroups!.map(group => ({ ...group, windows: group.windows.map(window => ({ ...window, remainingPercent: 0 })) })) }
    expect(accountWarning(drained)).toBe('Quota exhausted')
  })

  it('never hides a refresh error or a non-exhaustion reason', () => {
    expect(accountWarning({ ...groupedUsage, refreshError: 'boom', unavailableReason: 'Quota exhausted' })).toBe('boom')
    expect(accountWarning({ ...groupedUsage, unavailableReason: 'Authentication expired' })).toBe('Authentication expired')
  })
```

Extend the import at the top of the file to include `accountWarning`,
`formatInstant` and `hasRemainingQuota`.

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/quota-view.test.ts
```

Expected: FAIL — `formatInstant is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/renderer/src/components/quota/quota-view.ts`:

```ts
export function formatInstant(timestamp?: number): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

// A 429 earned by one quota group is stored on the account, so an account-level
// exhaustion warning must not speak for groups that still have quota.
export function hasRemainingQuota(usage?: ProviderUsage): boolean {
  const windows = usage?.quotaGroups?.flatMap(group => group.windows) ?? []
  return windows.some(window => window.usageKnown && (window.remainingPercent ?? 0) > 0)
}

export function accountWarning(usage?: ProviderUsage): string | undefined {
  if (usage?.refreshError) return usage.refreshError
  const reason = usage?.unavailableReason
  if (!reason) return undefined
  if (/quota exhausted|capacity exhausted/i.test(reason) && hasRemainingQuota(usage)) return undefined
  return reason
}
```

- [ ] **Step 4: Run to confirm the tests pass**

```bash
npx vitest run tests/unit/quota-view.test.ts
```

Expected: PASS. Running total **971**.

- [ ] **Step 5: Commit**

Stage both files. Subject:
`feat: add instant, remaining-quota and account-warning view helpers`

End the message with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 2: Next reset shows the countdown and the instant

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consumes: `formatInstant` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/quota-snapshot.test.tsx`:

```ts
  it('shows both the countdown and the exact reset instant', () => {
    const resetAt = new Date(2026, 7, 25, 19, 9, 2).getTime()
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account(), variant: 'chat',
      groups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session', remainingPercent: 70, resetAt, usageKnown: true, source: 'provider' }] }]
    } as never))
    expect(markup).toContain('19:09:02 25/08/2026')
    expect(markup).toContain('Next reset')
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/quota-snapshot.test.tsx
```

Expected: FAIL — the instant is absent from the markup.

- [ ] **Step 3: Implement**

In `QuotaAccountCard.tsx`, in the `QuotaWindow` component, replace the reset
line:

```tsx
    <span className="quota-window-reset">{window.resetAt ? `Next reset · ${formatCountdown(window.resetAt)} · ${formatInstant(window.resetAt)}` : 'Reset not reported'}</span>
```

Add `formatInstant` to the existing import from `./quota-view`.

- [ ] **Step 4: Run to confirm the test passes**

```bash
npx vitest run tests/unit/quota-snapshot.test.tsx
```

Expected: PASS. Running total **972**.

- [ ] **Step 5: Commit**

Subject: `fix: show the exact reset instant beside the countdown`

---

### Task 3: Stop an exhausted group speaking for the whole account

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consumes: `accountWarning` and `hasRemainingQuota` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/quota-snapshot.test.tsx`:

```ts
  it('does not print an exhaustion warning while a group still has quota', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, unavailableReason: 'Quota exhausted', quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 94, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, { account: account({ usage }), variant: 'chat', groups: usage.quotaGroups } as never))
    expect(markup).not.toContain('Quota exhausted')
  })

  it('keeps the account state ready while a group still has quota', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, unavailableReason: 'Quota exhausted', resetAt: 20, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 94, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    expect(quotaAccountState(account({ usage }), 10)).toBe('ready')
  })

  it('still reports cooldown when every window is drained', () => {
    const usage = { accountId: 'account-1', refreshedAt: 1, source: 'provider' as const, status: 'ok' as const, unavailableReason: 'Quota exhausted', resetAt: 20, quotaGroups: [{ id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [{ id: 'gemini-5h', label: '5-hour', kind: 'session' as const, remainingPercent: 0, resetAt: 200, usageKnown: true, source: 'provider' as const }] }] }
    expect(quotaAccountState(account({ usage }), 10)).toBe('cooldown')
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/quota-snapshot.test.tsx
```

Expected: FAIL on the first two cases. The third passes already.

- [ ] **Step 3: Gate the printed warning**

In `QuotaAccountCard.tsx`, replace the warning line:

```tsx
      {accountWarning(usage) ? <div className="quota-account-error" role="status">{accountWarning(usage)}</div> : null}
```

Add `accountWarning` to the import from `./quota-view`.

- [ ] **Step 4: Gate the two usage-derived state branches**

In `RightPanelQuota.tsx`, inside `quotaAccountState`, append
`&& !hasRemainingQuota(account.usage)` to the two conditions that read
`account.usage`:

```ts
  if (account.usage?.resetAt && account.usage.resetAt > now && /quota exhausted|capacity exhausted/i.test(account.usage.unavailableReason ?? '') && !hasRemainingQuota(account.usage)) return 'cooldown'
  if (account.error?.kind === 'quota-exhausted' || (account.usage?.unavailableReason?.toLowerCase().includes('quota exhausted') && !hasRemainingQuota(account.usage))) return 'quota-exhausted'
  if (account.error?.kind === 'capacity-exhausted' || (account.usage?.unavailableReason?.toLowerCase().includes('capacity exhausted') && !hasRemainingQuota(account.usage))) return 'capacity-exhausted'
```

Import `hasRemainingQuota` from `./quota/quota-view`. The `account.error?.kind`
halves stay ungated, per the global constraints. The parentheses are required:
without them the reader has to recall that `&&` binds tighter than `||`.

- [ ] **Step 5: Run to confirm the tests pass**

```bash
npx vitest run tests/unit/quota-snapshot.test.tsx
```

Expected: PASS, all three. Running total **975**.

- [ ] **Step 6: Commit**

Subject: `fix: stop an exhausted quota group speaking for the whole account`

Body: a 429 earned by one group is stored on the account, so a group at 94%
inherited a sibling's warning and an orchestrator reading that state would skip
a usable account.

---

### Task 4: Request count in the chat panel

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consumes: `ProviderTrackedUsage`, already imported by the card.
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

```ts
  it('shows the tracked request count in the chat panel', () => {
    const tracked = { periodKey: 'weekly:1', periodStart: 1, requests: 603, tokensInput: 0, tokensCache: 0, tokensOutput: 0, estimatedBilled: 0, source: 'bs-tracked' as const }
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, { account: account(), variant: 'chat', groups: [], tracked } as never))
    expect(markup).toContain('Requests')
    expect(markup).toContain('603')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: FAIL — the chat variant renders no Requests metric.

- [ ] **Step 3: Give `SessionMetrics` the metric**

```tsx
function SessionMetrics({ session, tracked }: { session?: Props['session']; tracked?: ProviderTrackedUsage }) {
  return <div className="quota-metrics">
    <span className="quota-metrics-source">Session estimate</span>
    <Metric label="Requests" value={formatCount(tracked?.requests)} />
    <Metric label="Token in" value={formatCount(session?.input ?? 0)} />
    <Metric label="Token out" value={formatCount(session?.output ?? 0)} />
    <Metric label="Estimated" value={formatMoney(session?.estimatedCost ?? 0)} />
  </div>
}
```

And at its call site:

```tsx
      {variant === 'provider' ? <ProviderMetrics tracked={tracked} /> : <SessionMetrics session={session} tracked={tracked} />}
```

- [ ] **Step 4: Pass `tracked` from the chat panel**

In `RightPanelQuota.tsx` at the `QuotaAccountCard` call, add
`tracked={account.usage?.tracked}` alongside the existing props.

- [ ] **Step 5: Run to confirm the test passes**

Expected: PASS. Running total **976**.

- [ ] **Step 6: Commit**

Subject: `feat: show the tracked request count in the chat quota panel`

Body: the count is aggregated per reset period by `selectTrackedPeriod`, so it
answers "requests used in the current window".

---

### Task 5: Reach the OpenAI subscription endpoint

**Files:**
- Modify: `src/main/connections/types.ts`
- Modify: `src/main/connections/codex.ts:59-73`
- Modify: `src/main/providers/adapters/openai.ts`
- Modify: `tests/unit/provider-openai-authorization.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `decodeJwtProfile` additionally returns `organizationId?: string`;
  `ProviderSecrets` gains `organizationId?: string`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/provider-openai-authorization.test.ts`:

```ts
  it('reads the account and organization ids from the auth claim', () => {
    const claim = { email: 'a@b.c', 'https://api.openai.com/auth': { account_id: 'acct-1', organization_id: 'org-1' } }
    const token = `x.${Buffer.from(JSON.stringify(claim)).toString('base64url')}.y`
    expect(decodeJwtProfile(token)).toMatchObject({ email: 'a@b.c', accountId: 'acct-1', organizationId: 'org-1' })
  })

  it('returns nothing for a malformed token', () => {
    expect(decodeJwtProfile('not-a-jwt')).toEqual({})
    expect(decodeJwtProfile(undefined)).toEqual({})
  })
```

Import `decodeJwtProfile` from `../../src/main/connections/codex`.

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/provider-openai-authorization.test.ts
```

Expected: FAIL — `organizationId` is absent from the result.

- [ ] **Step 3: Extend the claim decoder**

In `src/main/connections/codex.ts`, widen the return type to include
`organizationId?: string` and add to the returned object:

```ts
      organizationId: typeof auth?.organization_id === 'string' ? auth.organization_id : undefined
```

In `src/main/connections/types.ts`, add `organizationId?: string` to
`ProviderSecrets` beside `accountId`.

- [ ] **Step 4: Recover the ids at refresh time**

In `openai.ts`, inside `fetchUsage`, before the `for (let authAttempt …)` loop:

```ts
      if (!secret.accountId && secret.idToken) {
        const recovered = decodeJwtProfile(secret.idToken)
        if (recovered.accountId) Object.assign(secret, { accountId: recovered.accountId, organizationId: recovered.organizationId })
      }
```

`ProviderManager.fetchUsage` persists the mutated secret after the call, so the
recovery is written back once and costs nothing on later refreshes.

- [ ] **Step 5: Merge subscription metadata instead of returning early**

Replace the loop body in `fetchSubscriptionMetadata`:

```ts
  const merged: { planName?: string; subscriptionExpiresAt?: number } = {}
  for (const endpoint of endpoints) {
    if (merged.planName && merged.subscriptionExpiresAt) break
    try {
      const response = await fetch(endpoint, { headers })
      if (!response.ok) continue
      const metadata = extractOpenAISubscriptionMetadata(await response.json())
      merged.planName = merged.planName ?? metadata.planName
      merged.subscriptionExpiresAt = merged.subscriptionExpiresAt ?? metadata.subscriptionExpiresAt
    } catch { /* usage remains valid when subscription metadata is unavailable */ }
  }
  return merged
```

- [ ] **Step 6: Run the full suite and typecheck**

```bash
npm test && npm run typecheck
```

Expected: `Tests 979 passed (979)` and no typecheck diagnostics.

- [ ] **Step 7: Commit**

Subject: `fix: recover the ChatGPT account id so the subscription query can run`

Body: `secret.accountId` was empty on imported accounts, so
`/backend-api/subscriptions` sat behind `if (accountId)` and was never called,
while `accounts/check/v4` returns 403 to a Codex bearer. The id is already in the
stored `id_token` claim.

---

### Task 6: Measure the subscription endpoint and verify at runtime

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: everything above.
- Produces: a stated answer on whether the subscription endpoint yields an
  expiry for a Codex token.

- [ ] **Step 1: Launch and let the usage poll run**

```bash
npm run dev
```

Wait for `starting electron app...` and then for the startup poll to refresh the
accounts.

- [ ] **Step 2: Confirm the account id was recovered and the endpoint reached**

```bash
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('C:/Users/brads/AppData/Roaming/bs-coding/connections/accounts.json','utf8'));for(const c of a.connections||[])for(const x of c.accounts||[])console.log(c.providerId, x.usage?.planName??'-', x.usage?.subscriptionExpiresAt? new Date(x.usage.subscriptionExpiresAt).toISOString():'ABSENT')"
```

Expected: the OpenAI rows report an ISO instant. If they still report `ABSENT`,
that is the answer to the open question — record it and report the endpoint's
status rather than treating it as a bug to keep chasing.

- [ ] **Step 3: Check the card in the running app**

Open Settings → Providers and the chat quota panel. Confirm, by looking:
the Antigravity card shows the Gemini group with **no** false exhaustion warning;
Next reset shows both the countdown and the instant; the chat panel shows four
metrics including Requests.

- [ ] **Step 4: Stop the app and report**

Do not merge, tag, bump the version, or push. Report all six tasks, including the
measured outcome of step 2 either way, and wait for the final approval gate.
