# Pool-Scoped Quota State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Record which quota pool was refused, so an account with one exhausted
pool and one healthy pool is describable as exactly that.

**Architecture:** The adapter answers which pool a model draws from; the manager
uses that answer for both usage and errors; errors gain a per-pool home beside
the account-wide one; the card names the exhausted pool.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- Do not rewrite `usage-ledger.json` or `accounts.json`. Records without a pool
  stay as they are and age out with their period.
- Do not carry the pool id on `statusReason`. That field means why the last
  refresh degraded; overloading it repeats the confusion v1.1.7 removed.
- A model that matches no pool resolves to `undefined`, never to a default.
- An account record without `poolErrors` must behave exactly as it does today.
- Test baseline: 148 files, **1090** tests.
- Do not tag or bump the version.

### What was measured, for fixtures

The owner's real `usage-ledger.json`, before this work:

```
openai       gpt-5.6-sol      quotaGroupId = openai-base
antigravity  gemini-3.6-fla   quotaGroupId = None
antigravity  claude-opus-4-   quotaGroupId = None
antigravity  claude-sonnet-   quotaGroupId = None
```

The stored Antigravity groups carry `modelIds: []`, which is why the existing
lookup resolves nothing. Fixtures use these ids rather than invented ones.

---

### Task 1: The adapter answers which pool a model draws from

**Files:**
- Modify: `src/main/providers/types.ts`,
  `src/main/providers/adapters/antigravity.ts`,
  `src/main/providers/adapters/openai.ts`,
  `src/main/connections/manager.ts`
- Test: `tests/unit/provider-quota-pool.test.ts` (create)

**Interfaces:**
- Produces: `ProviderAdapter.quotaGroupForModel?(modelId: string): string | undefined`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

describe('quotaGroupForModel', () => {
  it('classifies the model ids the ledger actually holds', () => {
    const pool = createAntigravityAdapter().quotaGroupForModel!
    expect(pool('gemini-3.6-flash')).toBe('gemini')
    expect(pool('claude-opus-4-5')).toBe('claude-gpt')
    expect(pool('claude-sonnet-4-6')).toBe('claude-gpt')
  })

  it('returns undefined rather than guessing for a model it cannot place', () => {
    // A default here would silently attribute a future model's usage to the
    // wrong pool, and route around the wrong one.
    expect(createAntigravityAdapter().quotaGroupForModel!('something-new')).toBeUndefined()
  })

  it('names the single OpenAI pool', () => {
    expect(createOpenAiAdapter().quotaGroupForModel!('gpt-5.6-sol')).toBe('openai-base')
  })
})
```

Read both adapter files first for the real factory names; correct the test to
match the files rather than the files to match the test.

- [ ] **Step 2: Run to confirm failure**

Expected: `quotaGroupForModel` is not a function.

- [ ] **Step 3: Declare and implement**

In `src/main/providers/types.ts`:

```ts
  /** Which quota pool a model draws on, or undefined when it cannot be placed. */
  quotaGroupForModel?(modelId: string): string | undefined
```

In `antigravity.ts`, delegate to the classifier that has existed all along:

```ts
    quotaGroupForModel: antigravityQuotaGroupForModel,
```

In `openai.ts`:

```ts
    // One pool covers every Codex model on this provider.
    quotaGroupForModel: () => 'openai-base',
```

- [ ] **Step 4: Use it where the pool is resolved**

In `manager.ts`, `recordRuntimeUsage` currently reads

```ts
    const groupId = account.usage?.quotaGroups?.find(group => group.modelIds.includes(modelId))?.id
      ?? (account.usage?.quotaGroups?.length === 1 ? account.usage.quotaGroups[0].id : undefined)
```

Replace with a single private helper used by this and by Task 2:

```ts
  // The provider knows this; quotaGroups[].modelIds does not — Antigravity
  // leaves it empty, which is why every Antigravity ledger row before v1.2.0
  // carries no pool at all.
  private poolFor(providerId: string, modelId: string, account: ProviderAccount): string | undefined {
    const declared = this.registry.get(providerId)?.quotaGroupForModel?.(modelId)
    if (declared) return declared
    const groups = account.usage?.quotaGroups
    return groups?.find(group => group.modelIds.includes(modelId))?.id
      ?? (groups?.length === 1 ? groups[0].id : undefined)
  }
```

The old lookup stays as the fallback so a provider that does not implement the
method behaves as before.

- [ ] **Step 5: Test the ledger attribution**

Add to `tests/unit/provider-quota-pool.test.ts` a case driving
`recordRuntimeUsage` through a manager whose Antigravity adapter declares the
method and whose stored groups carry `modelIds: []` — the shape the owner's data
is in — and assert the ledger row carries `quotaGroupId: 'claude-gpt'`.

Build the manager the way `tests/unit/connections-reset-credit.test.ts` does:
seed `accounts.json` on disk and pass a fake vault, rather than reaching through
a private field.

- [ ] **Step 6: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1094**. Commit as `fix: resolve a model's quota pool from the provider`.

Body must carry the measurement: three Antigravity ledger identities with no
pool after 425, 154 and 30 requests, because the lookup keyed on a field the
provider leaves empty.

---

### Task 2: Record and clear errors per pool

**Files:**
- Modify: `src/shared/types.ts`, `src/main/connections/manager.ts`
- Test: `tests/unit/connections-pool-errors.test.ts` (create)

**Interfaces:**
- Produces: `ProviderAccount.poolErrors?: Record<string, ProviderErrorState>`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('records a quota error under the pool that was refused', async () => {
    const { manager, accountId } = makeManager()
    await runTurnThatFails(manager, 'claude-sonnet-4-6', quotaExhausted())
    const account = manager.list('antigravity')[0].accounts[0]
    expect(account.poolErrors?.['claude-gpt']?.kind).toBe('quota-exhausted')
    expect(account.poolErrors?.['gemini']).toBeUndefined()
  })

  it('clears only the pool that succeeded', async () => {
    const { manager, accountId } = makeManager()
    await runTurnThatFails(manager, 'claude-sonnet-4-6', quotaExhausted())
    await runTurnThatSucceeds(manager, 'gemini-3.6-flash')
    const account = manager.list('antigravity')[0].accounts[0]
    // A Gemini turn succeeding says nothing about Claude. Clearing it here
    // would make the next turn try Claude again and earn the same 429.
    expect(account.poolErrors?.['claude-gpt']?.kind).toBe('quota-exhausted')
  })

  it('still records an auth failure account-wide', async () => {
    const { manager } = makeManager()
    await runTurnThatFails(manager, 'claude-sonnet-4-6', unauthorized())
    const account = manager.list('antigravity')[0].accounts[0]
    expect(account.providerError?.kind).toBe('auth')
    expect(account.poolErrors).toBeUndefined()
  })

  it('reads an account stored without poolErrors unchanged', () => {
    // No migration: an older record must behave exactly as it does today.
    const { manager } = makeManager({ legacy: true })
    expect(manager.list('antigravity')[0].accounts[0].poolErrors).toBeUndefined()
  })
```

`runTurnThatFails` drives `createRuntime(...).stream(...)` with a stub adapter
whose runtime yields an error part, which is the real path
`recordRuntimeError` sits on. Do not call the private method directly: the point
of the test is that the model id reaches it.

- [ ] **Step 2: Run to confirm failure**

Expected: `poolErrors` does not exist.

- [ ] **Step 3: Add the field**

In `src/shared/types.ts`, beside `providerError`:

```ts
  /**
   * Quota errors, keyed by the pool that was refused. Separate from
   * providerError because an exhausted pool is a fact about one family of
   * models, while an expired token is a fact about the account. Folding them
   * together lets a second exhausted pool overwrite the first, and routing
   * needs to know about both.
   */
  poolErrors?: Record<string, ProviderErrorState>
```

- [ ] **Step 4: Route quota errors to the pool**

`recordRuntimeError` currently takes `(accountId, error)`. Give it the model:

```ts
  private recordRuntimeError(accountId: string, error: ReturnType<typeof classifyProviderError>, providerId?: string, modelId?: string): void {
    const current = this.store.get(accountId)
    if (!current) return
    const pool = providerId && modelId ? this.poolFor(providerId, modelId, current) : undefined
    const scoped = pool && (error.kind === 'quota-exhausted' || error.kind === 'capacity-exhausted')
    this.store.upsert(scoped
      ? { ...current, poolErrors: { ...current.poolErrors, [pool]: error } }
      : { ...current, lastError: error.message, providerError: error })
    this.emitAccountsChanged()
  }
```

Pass `providerId` and `modelId` at the three call sites in the `stream` closure,
where both are already in scope.

Only quota and capacity errors are scoped. Everything else is still a statement
about the account.

- [ ] **Step 5: Clear per pool**

`clearRuntimeError` is called on a successful turn at `manager.ts:158`, where
`modelId` is in scope. Give it the same two arguments and have it remove that
pool's entry, plus the account-wide error as today:

```ts
  private clearRuntimeError(accountId: string, providerId?: string, modelId?: string): void {
    const current = this.store.get(accountId)
    if (!current) return
    const pool = providerId && modelId ? this.poolFor(providerId, modelId, current) : undefined
    const poolErrors = pool && current.poolErrors ? { ...current.poolErrors } : undefined
    if (poolErrors && pool) delete poolErrors[pool]
    const hadPool = poolErrors && Object.keys(current.poolErrors ?? {}).length !== Object.keys(poolErrors).length
    if (!current.providerError && !current.lastError && !hadPool) return
    const { providerError: _p, lastError: _l, ...cleared } = current
    this.store.upsert({ ...cleared, ...(poolErrors && Object.keys(poolErrors).length > 0 ? { poolErrors } : {}) })
    this.emitAccountsChanged()
  }
```

- [ ] **Step 6: Verify and commit**

Expected: **1098**. Commit as `feat: record a quota refusal against the pool that was refused`.

---

### Task 3: Show which pool is exhausted

**Files:**
- Modify: `src/shared/provider-state.ts`, `src/main/connections/snapshot.ts`,
  `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/quota-snapshot.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('marks the exhausted pool while the healthy one stays quiet', () => {
    const markup = renderToStaticMarkup(React.createElement(QuotaAccountCard, {
      account: account({
        poolErrors: { 'claude-gpt': { kind: 'quota-exhausted', message: 'spent', updatedAt: 1 } }
      }),
      groups: [
        { id: 'gemini', label: 'Gemini Models', modelIds: [], windows: [] },
        { id: 'claude-gpt', label: 'Claude and GPT models', modelIds: [], windows: [] }
      ],
      variant: 'chat' as const
    }))
    // The card could only ever say "some pool is fine" before this. Now it can
    // say which one is not.
    expect(markup).toMatch(/Claude and GPT models[\s\S]*Quota exhausted/)
    expect(markup).not.toMatch(/Gemini Models[\s\S]*Quota exhausted[\s\S]*Claude/)
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: `poolErrors` is not a property of `ProviderAccountSnapshot`.

- [ ] **Step 3: Carry it to the renderer**

Add `poolErrors?: Record<string, ProviderErrorState>` to
`ProviderAccountSnapshot` in `src/shared/provider-state.ts`, and map it in
`buildProviderSnapshot` beside the existing `error` mapping.

- [ ] **Step 4: Render it**

In the group section at `QuotaAccountCard.tsx:116`, beside the label:

```tsx
          <h6>{group.label}{account.poolErrors?.[group.id]
            ? <span className="quota-pool-error" role="status">{STATE_LABELS[account.poolErrors[group.id].kind === 'capacity-exhausted' ? 'capacity-exhausted' : 'quota-exhausted']}</span>
            : null}</h6>
```

Add `.quota-pool-error` to `styles.css` reusing the existing
`.quota-state-quota-exhausted` colour rather than a new token.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1099**. Commit as `feat: name the exhausted quota pool on the card`.

---

### Task 4: Close the debt entry, verify, report

**Files:**
- Modify: `docs/technical-debt.md`, `docs/design/03-providers.md`,
  `docs/design/00-goals.md`

- [ ] **Step 1: Close item 1**

Remove it, renumber the survivors, repoint the index anchors and the two
citations in `03-providers.md` (lines 97 and 131, both "debt item 1").

- [ ] **Step 2: Correct the design document**

`03-providers.md` says the account-level reason "can only say some group is fine,
never which group is not". That is no longer true. Rewrite the sentence rather
than deleting it — the limitation is what this work removed, and the document
should say so.

- [ ] **Step 3: Mark A1 done in the goals**

In `00-goals.md`, group A, mark A1 as landed and note that A2 is now unblocked.

- [ ] **Step 4: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 5: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`.

- [ ] **Step 6: Run the app**

Open a project with the Antigravity account selected. The card should show
`claude-gpt` exhausted and `gemini` healthy **at the same time** — the state that
could not be expressed before. Confirm an OpenAI card is unchanged.

- [ ] **Step 7: Report and stop**

Do not merge, tag, or push. Report all four tasks and wait.
