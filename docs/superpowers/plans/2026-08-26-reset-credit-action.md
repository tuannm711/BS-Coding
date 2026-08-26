# Reset Credit Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Spend a ChatGPT reset credit from the quota card, guarded so a scarce
credit is not wasted.

**Architecture:** A pure gate in `src/shared` that both processes evaluate, an
optional adapter method that only OpenAI implements, a manager method that
enforces the gate before calling it, and a confirmation dialog in the renderer.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- **Never spend a credit during development or verification.** The owner holds
  one. No test posts to the real endpoint; every test stubs `fetch`.
- The retry after a 401 reuses the **same** `redeem_request_id`. A fresh id
  spends two credits.
- The gate is `available > 0` **and** weekly remaining **strictly under 5%**. At
  exactly 5% the button stays disabled.
- Unknown weekly figure means the gate is not satisfied.
- The gate is enforced in the main process. The renderer mirrors it for the
  reason text; it is not the authority.
- Test baseline: 145 files, **1072** tests.
- Do not tag or bump the version.

### The protocol, read from cockpit's source

```
POST https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume
headers: Bearer, originator, user-agent, referer, ChatGPT-Account-Id,
         content-type: application/json
body:    { "redeem_request_id": "<uuid v4>" }
```

---

### Task 1: The gate

**Files:**
- Create: `src/shared/reset-credit.ts`
- Test: `tests/unit/reset-credit.test.ts`

**Interfaces:**
- Produces: `resetCreditGate(usage: ProviderUsage | undefined): ResetCreditGate`,
  where `ResetCreditGate` is
  `{ allowed: true } | { allowed: false; reason: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { resetCreditGate } from '../../src/shared/reset-credit'
import type { ProviderUsage } from '../../src/shared/types'

const usage = (patch: Partial<ProviderUsage>): ProviderUsage =>
  ({ accountId: 'a1', refreshedAt: 1, source: 'provider', status: 'ok', ...patch })

const weekly = (remainingPercent?: number) => usage({
  resetCredits: { available: 1, applicable: 0 },
  quotaGroups: [{
    id: 'openai-base', label: 'Codex', modelIds: [],
    windows: [{
      id: 'secondary', label: 'Weekly', kind: 'weekly',
      ...(remainingPercent === undefined ? {} : { remainingPercent }),
      usageKnown: remainingPercent !== undefined, source: 'provider'
    }]
  }]
})

describe('resetCreditGate', () => {
  it('admits a credit when the week is nearly spent', () => {
    expect(resetCreditGate(weekly(4.9))).toEqual({ allowed: true })
  })

  it('refuses when no credit is held', () => {
    const value = usage({ resetCredits: { available: 0, applicable: 0 } })
    expect(resetCreditGate(value).allowed).toBe(false)
  })

  it('refuses at exactly five percent', () => {
    // Strictly under. One step too cautious costs nothing; one step too loose
    // costs a credit that cannot be recovered.
    expect(resetCreditGate(weekly(5)).allowed).toBe(false)
  })

  it('refuses while most of the week remains', () => {
    expect(resetCreditGate(weekly(69)).allowed).toBe(false)
  })

  it('refuses when the weekly figure is unknown', () => {
    // A gate that cannot be evaluated has not been satisfied.
    expect(resetCreditGate(weekly(undefined)).allowed).toBe(false)
  })

  it('refuses when there is no weekly window at all', () => {
    expect(resetCreditGate(usage({ resetCredits: { available: 1, applicable: 1 } })).allowed).toBe(false)
  })

  it('refuses when there is no usage', () => {
    expect(resetCreditGate(undefined).allowed).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/reset-credit.test.ts
```

Expected: the module does not resolve.

- [ ] **Step 3: Implement**

```ts
import type { ProviderUsage } from './types'

export type ResetCreditGate = { allowed: true } | { allowed: false; reason: string }

/** Strictly under this, never equal to it. */
export const WEEKLY_REMAINING_LIMIT = 5

// A reset credit resets the whole weekly quota, not the 5-hour window alone,
// so spending one while the week is largely unused throws away its value.
export function resetCreditGate(usage: ProviderUsage | undefined): ResetCreditGate {
  const available = usage?.resetCredits?.available ?? 0
  if (available <= 0) return { allowed: false, reason: 'No reset credit available' }
  const week = usage?.quotaGroups?.flatMap(group => group.windows).find(window => window.kind === 'weekly')
  if (!week || !week.usageKnown || week.remainingPercent === undefined) {
    return { allowed: false, reason: 'Weekly quota is not reported, so this cannot be checked' }
  }
  if (week.remainingPercent >= WEEKLY_REMAINING_LIMIT) {
    return { allowed: false, reason: `Weekly quota is at ${Math.round(week.remainingPercent)}% — a reset is only worth spending below ${WEEKLY_REMAINING_LIMIT}%` }
  }
  return { allowed: true }
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1079**. Commit as `feat: gate spending a reset credit on the weekly quota`.

---

### Task 2: The adapter method

**Files:**
- Modify: `src/main/providers/types.ts`, `src/main/providers/adapters/openai.ts`
- Test: `tests/unit/provider-openai-reset-credit.test.ts` (create)

**Interfaces:**
- Produces: `ProviderAdapter.consumeResetCredit?(account, secret): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createOpenAIAdapter } from '../../src/main/providers/adapters/openai'

const account = { id: 'a1', providerId: 'openai', label: 'x', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1 }
const secret = { accessToken: 'token', refreshToken: 'refresh', accountId: 'acct' }

describe('consumeResetCredit', () => {
  it('posts a redeem request id to the consume endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await createOpenAIAdapter().consumeResetCredit!(account, secret)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body)).redeem_request_id).toBeTruthy()
  })

  it('reuses the same redeem request id after a 401', async () => {
    // A fresh id on the retry spends two credits. This is the whole reason the
    // id is generated before the first attempt rather than inside it.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"access_token":"new","refresh_token":"r2"}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await createOpenAIAdapter().consumeResetCredit!(account, secret)
    const posts = fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/consume'))
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[0][1]?.body)).redeem_request_id)
      .toBe(JSON.parse(String(posts[1][1]?.body)).redeem_request_id)
  })

  it('throws when the endpoint refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })))
    await expect(createOpenAIAdapter().consumeResetCredit!(account, secret)).rejects.toThrow('400')
  })
})
```

Read `openai.ts` first for the adapter's real factory name and the shape of
`refreshCodexToken`; the names above follow the file's existing conventions and
must be corrected to match rather than the file changed to match them.

- [ ] **Step 2: Run to confirm failure**

Expected: `consumeResetCredit` is not a function.

- [ ] **Step 3: Implement**

Add to `ProviderAdapter` in `src/main/providers/types.ts`:

```ts
  /** Spend one provider-side quota reset. Irreversible. */
  consumeResetCredit?(account: ProviderAccount, secret: ProviderSecrets): Promise<void>
```

In `openai.ts`, beside `fetchUsage`, reusing its header block:

```ts
    async consumeResetCredit(account, secret) {
      if (account.authMode !== 'oauth' || !secret.accessToken) {
        throw new Error('[bs] A reset credit needs a ChatGPT OAuth account')
      }
      // Generated once, before the first attempt: a retry that mints a new id
      // spends a second credit.
      const redeemRequestId = randomUUID()
      const post = async () => fetch('https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume', {
        method: 'POST',
        headers: { ...codexHeaders(secret), 'content-type': 'application/json' },
        body: JSON.stringify({ redeem_request_id: redeemRequestId })
      })
      let response = await post()
      if (response.status === 401 && secret.refreshToken) {
        Object.assign(secret, await refreshCodexToken(secret.refreshToken))
        response = await post()
      }
      if (!response.ok) throw new Error(`[bs] Reset credit refused (${response.status}): ${await response.text()}`)
    },
```

`codexHeaders` is the header object `fetchUsage` builds inline today. Extract it
to a small local function so both use one definition rather than two copies that
can drift.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1082**. Commit as `feat: post a reset credit consume request`.

Body must name the same-id retry and why it matters.

---

### Task 3: The manager method and the channel

**Files:**
- Modify: `src/main/connections/manager.ts`, `src/shared/ipc.ts`,
  `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/unit/connections-reset-credit.test.ts` (create)

**Interfaces:**
- Produces: `ConsumeResetCreditResult =
  { status: 'refused'; reason: string } | { status: 'failed'; error: string } |
  { status: 'consumed'; refreshError?: string }`, and
  `consumeResetCredit(providerId, accountId): Promise<ConsumeResetCreditResult>`
  on both the manager and `AgentApi`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('refuses without calling the adapter when the gate says no', async () => {
    // The gate lives here, not only on the button. A disabled button is a
    // courtesy; the channel can be called regardless and this cannot be undone.
    const consume = vi.fn()
    const manager = makeManager({ weeklyRemaining: 69, available: 1, consume })
    const result = await manager.consumeResetCredit('openai', 'a1')
    expect(result.status).toBe('refused')
    expect(consume).not.toHaveBeenCalled()
  })

  it('consumes and refreshes when the gate admits', async () => {
    const consume = vi.fn(async () => {})
    const manager = makeManager({ weeklyRemaining: 2, available: 1, consume })
    expect((await manager.consumeResetCredit('openai', 'a1')).status).toBe('consumed')
    expect(consume).toHaveBeenCalledOnce()
  })

  it('reports a consumed credit even when the refresh afterwards fails', async () => {
    // The credit is gone either way. Reporting this as a failure would tell the
    // user to try again, which would spend another.
    const manager = makeManager({ weeklyRemaining: 2, available: 1, consume: async () => {}, refreshThrows: true })
    const result = await manager.consumeResetCredit('openai', 'a1')
    expect(result.status).toBe('consumed')
    expect(result.status === 'consumed' && result.refreshError).toBeTruthy()
  })
```

Build `makeManager` from the fakes already used in `tests/unit/connections-store.test.ts`
and the adapter registry stub in `tests/unit/provider-snapshot.test.ts`; do not
invent a new harness shape.

- [ ] **Step 2: Run to confirm failure**

Expected: `consumeResetCredit` is not a function on the manager.

- [ ] **Step 3: Implement the manager method**

```ts
  async consumeResetCredit(providerId: string, accountId: string): Promise<ConsumeResetCreditResult> {
    const account = this.store.get(accountId)
    const secret = this.store.getSecret(accountId)
    const adapter = this.registry.get(providerId)
    if (!account || !secret || !adapter?.consumeResetCredit) {
      return { status: 'refused', reason: 'This account cannot spend a reset credit' }
    }
    const gate = resetCreditGate(account.usage)
    if (!gate.allowed) return { status: 'refused', reason: gate.reason }
    try {
      await adapter.consumeResetCredit(account, secret)
    } catch (error) {
      return { status: 'failed', error: String(error) }
    }
    try {
      await this.refreshUsage(providerId, accountId)
    } catch (error) {
      return { status: 'consumed', refreshError: String(error) }
    }
    return { status: 'consumed' }
  }
```

- [ ] **Step 4: Add the channel**

`Channels.ProviderResetCreditConsume` in `src/shared/ipc.ts`, the method on
`AgentApi`, the implementation in `src/preload/index.ts`, and the handler in
`src/main/index.ts` beside `ProviderAccountRefresh`.

- [ ] **Step 5: Check the contract test**

```bash
npx vitest run tests/unit/ipc-contract.test.ts
```

A new `AgentApi` member needs a stub there. That suite went 24 members behind
once already; add it rather than letting it drift again.

- [ ] **Step 6: Verify and commit**

Expected: **1085**. Commit as `feat: consume a reset credit through the provider manager`.

---

### Task 4: The button and the confirmation

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/components/RightPanelQuota.tsx`,
  `src/renderer/src/styles.css`
- Create: `src/renderer/src/components/quota/ResetCreditDialog.tsx`
- Test: `tests/unit/quota-snapshot.test.tsx`

- [ ] **Step 1: Rewrite the wording test**

`tests/unit/quota-snapshot.test.tsx` currently contains
`it('says a held reset credit cannot be used right now', ...)`, which asserts the
string `not usable now`. That assertion is being removed deliberately, not
because it became inconvenient: cockpit performs this action successfully while
ignoring `applicable_available_count` entirely, so the claim is unsupported.

Replace it with:

```tsx
  it('states the count without interpreting it', () => {
    const markup = withCredits({ available: 1, applicable: 0 })
    expect(markup).toContain('1 reset')
    expect(markup).not.toContain('not usable now')
  })
```

- [ ] **Step 2: Add the button tests**

```tsx
  it('enables the reset button only when the gate admits', () => {
    const admitted = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account({ usage: weeklyUsage(2) }), groups: [], variant: 'chat', onConsumeResetCredit: () => {}
    }))
    expect(admitted).not.toContain('disabled=""')

    const refused = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account({ usage: weeklyUsage(69) }), groups: [], variant: 'chat', onConsumeResetCredit: () => {}
    }))
    expect(refused).toContain('disabled=""')
    expect(refused).toContain('69%')
  })
```

`weeklyUsage(remaining)` builds the same shape as the gate test's `weekly`
helper. Copy it into this file rather than importing across test files.

- [ ] **Step 3: Implement**

The badge becomes a button when `onConsumeResetCredit` is passed, disabled when
`resetCreditGate(usage).allowed` is false, with the gate's `reason` as its
`title`. Without the handler it stays the read-only span, so the provider
variant is unchanged.

`ResetCreditDialog` follows `AddProjectDialog`: `createPortal`, Escape to close,
no backdrop dismissal. It states that one credit will be spent, that this cannot
be undone, and that weekly and 5-hour quota are both reset.

`RightPanelQuota` opens the dialog, calls
`window.api.consumeResetCredit(providerId, accountId)` on confirm, and reports
the three outcomes distinctly — `consumed` with a `refreshError` says the credit
was spent and the refresh failed, never "try again".

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1087**. Commit as `feat: spend a reset credit from the quota card`.

---

### Task 5: Close the debt entry, verify, report

- [ ] **Step 1: Remove debt item 10**

`docs/technical-debt.md` item 10 is closed by this work. Remove it, renumber the
survivors, repoint the index anchors and any citation in `docs/design/`.

- [ ] **Step 2: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 3: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`.

- [ ] **Step 4: Run the app, and do not press the button**

Confirm on `nguyenminhtuan.90vn@`, at 69% weekly remaining, that the button is
**disabled** and its reason names the percentage. Confirm an Antigravity card
shows no reset control at all.

**Do not spend the credit.** The first real use is the owner's decision. Say so
in the report rather than leaving it implied.

- [ ] **Step 5: Report and stop**

Do not merge, tag, or push. Report all five tasks, and state plainly that the
endpoint itself is unproven because proving it costs a credit.
