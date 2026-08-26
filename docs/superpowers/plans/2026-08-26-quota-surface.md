# Quota Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Make the chat quota card refreshable on demand, show ChatGPT reset
credits, and stop parsing a field the provider never sends.

**Architecture:** One parser gains a field and loses a dead one; one card gains a
footer for its chat variant and a badge; one panel wires the refresh handler it
never passed. No new IPC channel — `refreshProviderAccount` already exists and is
already declared in the contract.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- The reset **action** is out of scope. No POST is written, no endpoint is
  guessed. The owner still holds an unspent credit and asked it be left alone.
- Absent and zero are different. A provider that does not report reset credits
  must yield `undefined`, never `0`.
- The badge is a statement of fact, not a control. It must not look clickable.
- Do not add Reconnect, Activate or Remove to the chat card.
- Test baseline: 145 files, **1063** tests.
- Do not tag or bump the version.

### The measured response, for fixtures

Captured 2026-08-26 by a read-only GET on
`https://chatgpt.com/backend-api/wham/usage`. Fixtures in this plan are built
from it rather than invented.

```json
{
  "plan_type": "plus",
  "rate_limit": {
    "primary_window": { "used_percent": 0, "limit_window_seconds": 18000, "reset_at": 1787740292 },
    "secondary_window": { "used_percent": 31, "limit_window_seconds": 604800, "reset_at": 1788272205 }
  },
  "credits": { "has_credits": false, "unlimited": false, "balance": 0 },
  "rate_limit_reset_credits": { "available_count": 1, "applicable_available_count": 0 }
}
```

---

### Task 1: Parse the field the provider actually sends

**Files:**
- Modify: `src/shared/types.ts`, `src/main/connections/usage.ts`
- Test: `tests/unit/connections-usage.test.ts`

**Interfaces:**
- Produces: `ProviderUsage.resetCredits?: { available: number; applicable: number }`.
  `bankedUsed` and `bankedLimit` no longer exist.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/connections-usage.test.ts`:

```ts
  it('reads ChatGPT reset credits', () => {
    const usage = normalizeOpenAICodexUsage('a1', {
      plan_type: 'plus',
      rate_limit: { primary_window: { used_percent: 0, reset_at: 1787740292 } },
      rate_limit_reset_credits: { available_count: 1, applicable_available_count: 0 }
    })
    expect(usage.resetCredits).toEqual({ available: 1, applicable: 0 })
  })

  it('leaves reset credits undefined when the provider does not report them', () => {
    // Absent and zero are different: a provider without the concept must not
    // render as "0 resets".
    const usage = normalizeOpenAICodexUsage('a1', {
      plan_type: 'plus',
      rate_limit: { primary_window: { used_percent: 0, reset_at: 1787740292 } }
    })
    expect(usage.resetCredits).toBeUndefined()
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/connections-usage.test.ts
```

Expected: both fail — `resetCredits` is undefined in the first, and the property
does not exist on the type.

- [ ] **Step 3: Add the field, remove the dead one**

In `src/shared/types.ts`, replace

```ts
  bankedUsed?: number
  bankedLimit?: number
```

with

```ts
  /**
   * ChatGPT rate-limit reset credits. `applicable` is lower than `available`
   * when a credit is held but cannot be spent right now — observed when the
   * window it would reset had no usage. Absent when the provider has no such
   * concept; do not default it to zero.
   */
  resetCredits?: { available: number; applicable: number }
```

In `src/main/connections/usage.ts`, add to the destructured response type

```ts
    rate_limit_reset_credits?: { available_count?: number; applicable_available_count?: number }
```

and replace the two `banked` lines in the `normalizeUsage` call with

```ts
    resetCredits: value.rate_limit_reset_credits?.available_count === undefined
      ? undefined
      : {
          available: value.rate_limit_reset_credits.available_count,
          applicable: value.rate_limit_reset_credits.applicable_available_count ?? 0
        },
```

Remove `banked?: { used?: number; limit?: number }` from that same response type.

- [ ] **Step 4: Confirm the dead field is gone**

```bash
grep -rn "bankedUsed\|bankedLimit\|banked?" src/ tests/
```

Expected: no output.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1065**. Commit as `fix: read the reset-credit field the provider sends`.

The body must say what was measured: `banked` is not a renamed field, it is a
shape the endpoint has never returned, so nothing that read it ever worked.

---

### Task 2: A refresh control on the chat card

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/components/RightPanelQuota.tsx`
- Test: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consumes: `QuotaAccountCard`'s existing `onRefresh` and `refreshing` props.
- Produces: nothing new; the chat variant renders a footer.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/quota-snapshot.test.tsx`:

```tsx
  it('offers a refresh control on the chat card', () => {
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account(), groups: [], variant: 'chat', onRefresh: () => {}
    }))
    expect(markup).toContain('Refresh')
  })

  it('keeps account management off the chat card', () => {
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account(), groups: [], variant: 'chat', onRefresh: () => {}
    }))
    // The chat frame is not where accounts are managed, and a destructive
    // control does not belong beside a running conversation.
    expect(markup).not.toContain('Reconnect')
    expect(markup).not.toContain('Remove')
    expect(markup).not.toContain('Deactivate')
  })

  it('still offers every provider control on the provider card', () => {
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account(), groups: [], variant: 'provider', onRefresh: () => {}
    }))
    for (const label of ['Refresh', 'Reconnect', 'Remove']) expect(markup).toContain(label)
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the first fails — the chat variant renders no footer today.

- [ ] **Step 3: Give the chat variant its own footer**

In `QuotaAccountCard.tsx`, the footer at line 106 is gated on
`variant === 'provider'`. Keep that block unchanged and add beside it:

```tsx
      {variant === 'chat' && onRefresh ? <footer className="quota-card-actions">
        <button className="btn small" type="button" disabled={refreshing} onClick={onRefresh}>
          <RefreshCw size={13} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </footer> : null}
```

Guarding on `onRefresh` keeps the footer out when no handler was passed, so a
caller that has nothing to do does not render a dead button.

- [ ] **Step 4: Wire the panel**

In `RightPanelQuota.tsx`, add state beside the existing snapshot state:

```tsx
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
```

and pass to `QuotaAccountCard` in the `rows.map`:

```tsx
            refreshing={refreshingId === account.id}
            onRefresh={() => {
              setRefreshingId(account.id)
              void window.api.refreshProviderAccount(account.providerId, account.id)
                .then(next => setSnapshot(next))
                .finally(() => setRefreshingId(null))
            }}
```

`refreshProviderAccount` returns a `ProviderSnapshot`, which is what this panel
already holds, so the result replaces the state directly. `finally` clears the
flag on failure too, or the button stays disabled forever after one error.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1068**. Commit as `feat: refresh a quota card from the chat panel`.

Body should note the automatic poll is five minutes and stays that way —
shortening it would spend a request for every account whether or not anyone is
looking.

---

### Task 3: Show reset credits

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consumes: `ProviderUsage.resetCredits` from Task 1.

- [ ] **Step 1: Write the failing tests**

```tsx
  const withCredits = (resetCredits?: { available: number; applicable: number }) =>
    renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account({ usage: { accountId: 'account-1', refreshedAt: 1, source: 'provider', status: 'ok', resetCredits } }),
      groups: [], variant: 'chat'
    }))

  it('shows a reset credit that can be used', () => {
    const markup = withCredits({ available: 2, applicable: 2 })
    expect(markup).toContain('2 resets')
  })

  it('says a held reset credit cannot be used right now', () => {
    const markup = withCredits({ available: 1, applicable: 0 })
    expect(markup).toContain('1 reset')
    expect(markup).toContain('not usable now')
  })

  it('shows nothing when the provider does not report reset credits', () => {
    expect(withCredits(undefined)).not.toContain('reset')
  })
```

The third case is the point of the `undefined` handling in Task 1. If it renders
"0 resets", a provider without the concept is being described as having none
left, which is a different claim.

- [ ] **Step 2: Run to confirm failure**

Expected: all three fail — nothing renders `resetCredits` today.

- [ ] **Step 3: Render the badge**

In `QuotaAccountCard.tsx`, beside the plan badge in `quota-account-badges`:

```tsx
          {usage?.resetCredits ? <span className="quota-reset-badge" role="status">
            {usage.resetCredits.available} reset{usage.resetCredits.available === 1 ? '' : 's'}
            {usage.resetCredits.applicable === 0 && usage.resetCredits.available > 0 ? ' · not usable now' : ''}
          </span> : null}
```

A `span` with `role="status"`, not a button. Spending a credit is not
implemented, and a control that looks clickable would promise otherwise.

Add `.quota-reset-badge` to `styles.css` beside `.quota-plan-badge`, reusing the
same shape and the existing `--text-faint` token so it reads as information
rather than as an action.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1071**. Commit as `feat: show ChatGPT reset credits on the quota card`.

Body must state the badge is read-only and why: the POST endpoint that spends a
credit is not known, and guessing one risks spending the owner's.

---

### Task 4: Record what was left, verify, report

**Files:**
- Modify: `docs/technical-debt.md`

- [ ] **Step 1: Add the reset action as debt**

A new entry: spending a reset credit is not implemented because the usage
response does not reveal the POST endpoint. State the unblocking condition
explicitly — the endpoint, from watching cockpit's network traffic or reading
its source — the way item 1 stated its condition and was unblocked by it
arriving.

- [ ] **Step 2: Add the balance model as debt**

The same response carries `credits.has_credits`, `credits.unlimited`,
`credits.balance`, `credits.approx_local_messages`, `credits.approx_cloud_messages`
and `spend_control.individual_limit`, none of which is parsed. This is the
balance quota model named in `docs/design/00-goals.md`, present on a provider
already in use — which corrects the assumption in that document that designing
it should wait for a DeepSeek account.

Update `docs/design/00-goals.md` where it says C1 should be designed against a
real account's response: one is available now.

- [ ] **Step 3: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 4: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`, not a grep of the output.

- [ ] **Step 5: Run the app**

Open a project with a ChatGPT agent selected. Confirm the chat quota card shows
a Refresh button, that pressing it updates the numbers without opening Settings,
and that the account holding a credit shows "1 reset · not usable now". Confirm
an Antigravity card shows no reset badge at all.

- [ ] **Step 6: Report and stop**

Do not merge, tag, or push. Report all four tasks and wait for the final gate.
