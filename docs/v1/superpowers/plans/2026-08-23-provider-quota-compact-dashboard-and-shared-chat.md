# Provider Quota Accuracy, Compact Dashboard, and Shared Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver provider-native quota data and compact account cards, persist exact BS-tracked account usage, and then replace per-Agent native chat panes with one shared chat frame whose Agent menu cannot be clipped.

**Architecture:** Main process remains the only authority for provider payload normalization, credentials, persistent usage accounting, stale-cache policy, and snapshot revisioning. Renderer consumes normalized quota groups and derives either an all-groups Providers view or a selected-Agent chat view. Native Agents share one selected chat pane while PTY terminal panes remain independent; the Agent picker switches the selected native Agent and renders its menu through a document-level fixed portal.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, Testing Library, Playwright, CSS, main/preload/renderer IPC through `Channels`.

**Approved spec:** `docs/superpowers/specs/2026-08-23-provider-quota-accuracy-compact-dashboard-design.md`

---

## Execution constraints

1. Preserve the current dirty worktree. Stage and commit only files listed by the active task.
2. Work test-first: add a focused failing assertion, record the expected failure, implement the smallest coherent change, then rerun the focused suite.
3. Do not fabricate a quota window, remaining percentage, plan, subscription expiry, or billed amount.
4. OAuth token expiry must never populate subscription expiry.
5. All provider/account/model attribution uses exact persisted IDs; no implicit first-account or first-model fallback.
6. A refresh failure retains the last successful quota groups and marks them stale.
7. Providers renders all reported families; chat renders only families matched by the currently selected native Agent.
8. PTY terminal panes keep their existing lifecycle and layout. Only native Agent chat panes collapse into one shared pane.
9. End each task with its focused tests, `npm run typecheck`, `git diff --check`, and a scoped commit.
10. Final completion requires `npm test`, `npm run build`, and `npm run e2e`, plus a running-app evidence note.

## File responsibility map

### Shared contracts

- Modify `src/shared/types.ts`: define `ProviderQuotaWindow`, `ProviderQuotaGroup`, `ProviderTrackedUsage`, and extend `ProviderUsage` without deleting legacy migration fields.
- Modify `src/shared/provider-state.ts`: expose quota-aware snapshot types while preserving revision and assignment compatibility checks.

### Main-process quota and telemetry

- Modify `src/main/connections/usage.ts`: normalize percentages, reset timestamps, labels, OpenAI window shapes, and legacy compatibility.
- Modify `src/main/providers/adapters/openai.ts`: fetch account-scoped usage/subscription payloads and retain all returned rate-limit families.
- Modify `src/main/providers/antigravity-models.ts`: canonicalize Antigravity models and parse grouped or legacy quota payloads.
- Modify `src/main/providers/adapters/antigravity.ts`: call quota summary, quota, then model fallback in that order.
- Modify `src/main/connections/snapshot.ts`: deduplicate canonical model rows and carry normalized usage into the canonical snapshot.
- Create `src/main/connections/usage-ledger.ts`: versioned atomic persistence, active-period selection, rollover, bounded history, and account/model usage recording.
- Modify `src/main/connections/manager.ts`: instrument successful runtime responses, merge active tracked usage, and preserve last-known-good quota on refresh errors.
- Modify `src/main/index.ts`: construct the ledger at `userData/connections/usage-ledger.json` and inject it into `ProviderManager`.

### Renderer quota dashboard

- Modify `src/renderer/src/components/quota/quota-view.ts`: build provider and chat presentation rows from normalized groups.
- Modify `src/renderer/src/components/quota/QuotaAccountCard.tsx`: reusable compact card with optional lifecycle actions and speed controls.
- Modify `src/renderer/src/components/settings/ProvidersTab.tsx`: one full-width compact card per account, all quota groups, collapsed models.
- Modify `src/renderer/src/components/RightPanelQuota.tsx`: selected-Agent family filtering and session-only metrics.
- Modify `src/renderer/src/styles.css`: compact responsive card layout, progress semantics, bounded expanded model list, right-panel fit.

### Shared native chat

- Modify `src/renderer/src/App.tsx`: own selected native Agent ID, reconcile it on workspace updates, and build one native pane plus all terminal panes.
- Modify `src/renderer/src/components/PaneGrid.tsx`: accept Agent-switch information and keep terminal focus/zoom behavior.
- Modify `src/renderer/src/components/Pane.tsx`: pass selectable native Agents and selection callback into the one chat panel.
- Modify `src/renderer/src/components/chat/ChatPanel.tsx`: render the Agent picker as navigation rather than mutating the current pane profile.
- Modify `src/renderer/src/components/chat/AgentPicker.tsx`: controlled selection, live options, portal rendering, keyboard/focus/outside-click behavior.
- Create `src/renderer/src/components/chat/agent-picker-position.ts`: pure viewport-clamped fixed-menu positioning.
- Modify `src/renderer/src/styles.css`: fixed portal layer and constrained menu dimensions.

### Tests and evidence

- Modify `tests/unit/connections-usage.test.ts`: OpenAI parsing and timestamp cases.
- Modify `tests/unit/antigravity-usage.test.ts`: grouped/legacy family parsing.
- Modify `tests/unit/provider-antigravity-models.test.ts`: aliases, excluded helper models, canonical IDs.
- Modify `tests/unit/provider-snapshot.test.ts`: model deduplication and stale usage carriage.
- Create `tests/unit/provider-usage-ledger.test.ts`: persistence, rollover, attribution, bounded history.
- Modify `tests/unit/connections-manager.test.ts`: runtime recording and last-known-good refresh policy.
- Modify `tests/unit/quota-view.test.ts`: all-groups and selected-model family projection.
- Modify `tests/unit/quota-snapshot.test.tsx`: chat account grouping, selected Agent, state distinctions.
- Create `tests/unit/shared-chat-selection.test.ts`: deterministic selected-Agent reconciliation and pane projection.
- Create `tests/unit/agent-picker-position.test.ts`: menu flipping and viewport clamping.
- Modify `tests/e2e/smoke.spec.ts`: compact quota smoke, one shared chat, live Agent add/remove/switch, visible portal menu.
- Create `docs/evidence/2026-08-23-provider-quota-shared-chat-verification.md`: automated output and manual connected-account observations.
- Modify `docs/changelog-0.25.7.md`: user-facing summary following `docs/changelog-format.md`.

## Phase 1 — Native quota contract and provider parsers

### Task 1: Add normalized quota groups and boundary helpers

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/provider-state.ts`
- Modify: `src/main/connections/usage.ts`
- Test: `tests/unit/connections-usage.test.ts`
- Test: `tests/unit/provider-state.test.ts`

- [ ] **Step 1: Add failing contract and normalization tests**

Add assertions proving seconds, milliseconds, ISO dates, relative resets, remaining percentage clamping, and missing-window preservation:

```ts
expect(normalizeResetAt(1_800_000_000, now)).toBe(1_800_000_000_000)
expect(normalizeResetAt(1_800_000_000_000, now)).toBe(1_800_000_000_000)
expect(normalizeResetAt('2030-01-01T00:00:00.000Z', now)).toBe(Date.parse('2030-01-01T00:00:00.000Z'))
expect(normalizeResetAt(undefined, now, 120)).toBe(now + 120_000)
expect(toRemainingPercent(42)).toBe(58)
expect(toRemainingPercent(-5)).toBe(100)
expect(toRemainingPercent(150)).toBe(0)
```

- [ ] **Step 2: Run the RED tests**

Run: `npx vitest run tests/unit/connections-usage.test.ts tests/unit/provider-state.test.ts`

Expected: FAIL because `normalizeResetAt`, `toRemainingPercent`, and quota-group fields do not exist.

- [ ] **Step 3: Add the shared contract and pure helpers**

Use these exact public shapes:

```ts
export interface ProviderQuotaWindow {
  id: string
  label: string
  kind: 'session' | 'weekly' | 'monthly' | 'additional' | 'unknown'
  remainingPercent?: number
  resetAt?: number
  windowMinutes?: number
  usageKnown: boolean
  source: 'provider' | 'legacy-provider'
}

export interface ProviderQuotaGroup {
  id: string
  label: string
  modelIds: string[]
  windows: ProviderQuotaWindow[]
}

export interface ProviderTrackedUsage {
  periodKey: string
  periodStart: number
  periodEnd?: number
  requests: number
  tokensInput: number
  tokensCache: number
  tokensOutput: number
  estimatedBilled: number
  source: 'bs-tracked'
}
```

Extend `ProviderUsage` with `quotaGroups?`, `tracked?`, `lastSuccessfulRefreshAt?`, `stale?`, and `refreshError?`. Retain `primaryUsedPercent`, `secondaryUsedPercent`, and `modelQuotas` until all renderer consumers migrate.

Implement the boundary functions:

```ts
export function normalizeResetAt(value: number | string | undefined, now = Date.now(), resetAfterSeconds?: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return resetAfterSeconds === undefined ? undefined : now + resetAfterSeconds * 1000
}

export function toRemainingPercent(usedPercent: number | undefined): number | undefined {
  return usedPercent === undefined || !Number.isFinite(usedPercent)
    ? undefined
    : Math.max(0, Math.min(100, 100 - usedPercent))
}
```

- [ ] **Step 4: Run GREEN tests and static checks**

Run: `npx vitest run tests/unit/connections-usage.test.ts tests/unit/provider-state.test.ts`

Expected: PASS with every reset represented in JavaScript milliseconds.

Run: `npm run typecheck`

Expected: PASS while legacy fields keep existing consumers compatible.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit only the five task files with: `git commit -m "feat: add native provider quota contracts"`

### Task 2: Parse every reported OpenAI quota family accurately

**Files:**
- Modify: `src/main/connections/usage.ts`
- Modify: `src/main/providers/adapters/openai.ts`
- Test: `tests/unit/connections-usage.test.ts`
- Test: `tests/unit/provider-adapter-contract.test.ts`

- [ ] **Step 1: Add RED fixtures for current, legacy, additional, and missing windows**

Add one fixture whose `rate_limit` has only `primary_window`, one with `rate_limits.primary/secondary`, and one with `additional_rate_limits`. Assert exact IDs, labels, remaining percentages, window minutes, and normalized resets:

```ts
expect(usage.quotaGroups).toEqual([
  {
    id: 'openai-base', label: 'Codex', modelIds: [], windows: [
      { id: 'primary', label: '5-hour', kind: 'session', remainingPercent: 58, resetAt: 1_800_000_000_000, windowMinutes: 300, usageKnown: true, source: 'provider' }
    ]
  },
  {
    id: 'openai-review', label: 'Code review', modelIds: [], windows: [
      { id: 'review-primary', label: 'Additional limit', kind: 'additional', remainingPercent: 75, usageKnown: true, source: 'provider' }
    ]
  }
])
```

Assert that a primary-only payload produces exactly one window and that `oauthExpiresAt` never appears as `subscriptionExpiresAt`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/connections-usage.test.ts tests/unit/provider-adapter-contract.test.ts`

Expected: FAIL because OpenAI still flattens usage to primary/secondary legacy fields and leaves numeric seconds unchanged.

- [ ] **Step 3: Implement OpenAI group parsing**

Introduce:

```ts
export function normalizeOpenAICodexUsage(accountId: string, raw: unknown, now = Date.now()): ProviderUsage
```

Build a base group only from objects actually present. Map `limit_window_seconds / 60` to `windowMinutes`; label `300` as `5-hour`, `10_080` as `Weekly`, and other durations from provider text or `Additional limit`. Give every additional limit a stable ID derived from its provider key/label, not its array index alone. Continue filling legacy fields from the base group only for migration compatibility.

In `openai.ts`, keep `wham/usage` ahead of `codex/usage`, merge subscription metadata in priority order, and use only verified account/subscription keys (`subscription_active_until`, `end_date`, `ends_at`, `subscription_expires_at`).

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/connections-usage.test.ts tests/unit/provider-adapter-contract.test.ts`

Expected: PASS; primary-only payload has no weekly row and seconds no longer render as 1970.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: normalize complete OpenAI quota windows"`

### Task 3: Add Antigravity grouped quota retrieval and legacy fallback

**Files:**
- Modify: `src/main/providers/antigravity-models.ts`
- Modify: `src/main/providers/adapters/antigravity.ts`
- Test: `tests/unit/antigravity-usage.test.ts`
- Test: `tests/unit/provider-antigravity-models.test.ts`
- Test: `tests/unit/antigravity-error-classification.test.ts`

- [ ] **Step 1: Add failing grouped and fallback tests**

Use a grouped response containing `gemini-5h`, `gemini-weekly`, `3p-5h`, and `3p-weekly`. Assert two groups and four windows. Add a legacy `fetchAvailableModels` response and assert it creates Gemini and Claude/GPT family rows without a fabricated Weekly window. Add a source-order test whose first two calls return unusable payloads and third call returns valid model quota.

```ts
expect(parseAntigravityQuotaSummary('a1', grouped, {}, now).quotaGroups?.map(group => group.id)).toEqual(['gemini', 'claude-gpt'])
expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([
  expect.stringContaining('retrieveUserQuotaSummary'),
  expect.stringContaining('retrieveUserQuota'),
  expect.stringContaining('fetchAvailableModels')
])
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/antigravity-usage.test.ts tests/unit/provider-antigravity-models.test.ts tests/unit/antigravity-error-classification.test.ts`

Expected: FAIL because only flattened per-model `quotaInfo` is currently parsed.

- [ ] **Step 3: Implement canonical family parsing and ordered endpoints**

Export these functions:

```ts
export function canonicalAntigravityModelId(id: string): string
export function antigravityQuotaGroupForModel(id: string): 'gemini' | 'claude-gpt' | undefined
export function parseAntigravityQuotaSummary(accountId: string, payload: unknown, metadata?: UsageMetadata, now?: number): ProviderUsage
export function parseAntigravityUsage(accountId: string, payload: unknown, metadata?: UsageMetadata, now?: number): ProviderUsage
```

Map `remaining.remainingFraction ?? remainingFraction` to remaining percent. Preserve bucket description/window/reset data. Exclude autocomplete, Lite helper, image, and hidden transport variants from representative quota selection, while leaving valid code models in the catalog. A bucket with reset data but no remaining fraction gets `usageKnown: false` and no percentage.

In the adapter, use a small `fetchQuotaPayload` helper that tries `retrieveUserQuotaSummary`, then `retrieveUserQuota`, then `fetchAvailableModels`, accepting the first account-matching payload containing a known quota value. Reuse existing OAuth refresh/error classification and do not start or inspect an external Antigravity process.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/antigravity-usage.test.ts tests/unit/provider-antigravity-models.test.ts tests/unit/antigravity-error-classification.test.ts`

Expected: PASS with two native families for the grouped fixture and no synthetic Weekly row for the legacy fixture.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: parse Antigravity quota families"`

### Task 4: Deduplicate canonical account models in snapshots

**Files:**
- Modify: `src/main/providers/antigravity-models.ts`
- Modify: `src/main/connections/snapshot.ts`
- Test: `tests/unit/provider-antigravity-models.test.ts`
- Test: `tests/unit/provider-snapshot.test.ts`

- [ ] **Step 1: Add a failing duplicate-alias snapshot test**

Construct an account catalog with two transport aliases resolving to the same persisted model and assert one row remains, code-capable metadata wins, and the selected assignment's canonical ID remains valid.

```ts
expect(snapshot.accounts[0].models.map(model => model.id)).toEqual(['gemini-2.5-pro', 'claude-sonnet-4-5'])
expect(snapshot.accounts[0].models[0].capabilities?.isCodeModel).toBe(true)
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/provider-antigravity-models.test.ts tests/unit/provider-snapshot.test.ts`

Expected: FAIL because snapshot construction currently maps every catalog row.

- [ ] **Step 3: Implement stable canonical deduplication**

Add a pure helper in `snapshot.ts`:

```ts
export function dedupeProviderModels(models: ProviderModelRef[]): ProviderModelRef[] {
  const byId = new Map<string, ProviderModelRef>()
  for (const model of models) {
    const current = byId.get(model.id)
    if (!current || (!current.capabilities?.isCodeModel && model.capabilities?.isCodeModel)) byId.set(model.id, model)
  }
  return [...byId.values()]
}
```

Canonicalize Antigravity IDs before building `ProviderModelRef`, retain transport IDs only inside adapter-private model metadata, and keep snapshot IDs equal to persisted assignment IDs.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/provider-antigravity-models.test.ts tests/unit/provider-snapshot.test.ts`

Expected: PASS with deterministic first-seen ordering.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: deduplicate provider model snapshots"`

## Phase 2 — Persistent account usage and refresh integrity

### Task 5: Implement the versioned BS usage ledger

**Files:**
- Create: `src/main/connections/usage-ledger.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/provider-usage-ledger.test.ts`

- [ ] **Step 1: Write failing persistence, attribution, and rollover tests**

Test exact provider/account/model/group keys, cache token separation, estimated cost, restart recovery, reset-boundary rollover, and a maximum of 12 historical periods per account/model:

```ts
ledger.record({ providerId: 'openai', accountId: 'acct-2', modelId: 'gpt-5.6-codex', quotaGroupId: 'openai-base', timestamp: now, tokens: { input: 100, output: 20, cacheRead: 30, cacheWrite: 5 }, estimatedCost: 0.04 }, period)
expect(ledger.active('openai', 'acct-2', 'gpt-5.6-codex', period)).toMatchObject({ requests: 1, tokensInput: 135, tokensCache: 35, tokensOutput: 20, estimatedBilled: 0.04, source: 'bs-tracked' })
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/provider-usage-ledger.test.ts`

Expected: FAIL because the ledger module does not exist.

- [ ] **Step 3: Implement the ledger API and atomic store**

Use these public interfaces:

```ts
export interface UsageLedgerRecord {
  providerId: string
  accountId: string
  modelId: string
  quotaGroupId?: string
  timestamp: number
  tokens: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  estimatedCost: number
}

export interface UsagePeriod { key: string; start: number; end?: number }

export class ProviderUsageLedger {
  constructor(private readonly file: string, private readonly maxPeriods = 12)
  record(input: UsageLedgerRecord, period: UsagePeriod): ProviderTrackedUsage
  active(providerId: string, accountId: string, modelId: string, period: UsagePeriod): ProviderTrackedUsage | undefined
  aggregateAccount(providerId: string, accountId: string, period: UsagePeriod, modelIds?: string[]): ProviderTrackedUsage | undefined
}
```

Persist `{ version: 1, records: ... }` using write-to-temp then rename in the same directory. Corrupt JSON starts an empty ledger without deleting the corrupt file. Do not persist prompts, credentials, raw responses, or message content.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/provider-usage-ledger.test.ts`

Expected: PASS including reconstruction by a second ledger instance.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: persist provider account usage ledger"`

### Task 6: Attribute successful runtime usage at the provider boundary

**Files:**
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/connections-manager.test.ts`
- Test: `tests/integration/provider-agent-chat.test.ts`

- [ ] **Step 1: Add failing successful/failed stream attribution tests**

Create a runtime stream that emits token usage and completes, then one that emits an error. Assert the successful response increments exactly once and the failed response does not increment. Assert account `acct-2` never records against another active OpenAI account.

```ts
expect(ledger.aggregateAccount('openai', 'acct-2', period)).toMatchObject({ requests: 1, tokensInput: 12, tokensOutput: 3 })
expect(ledger.aggregateAccount('openai', 'acct-1', period)).toBeUndefined()
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/connections-manager.test.ts tests/integration/provider-agent-chat.test.ts`

Expected: FAIL because `ProviderManager.createRuntime` currently forwards stream parts without ledger recording.

- [ ] **Step 3: Instrument the runtime wrapper**

Extend dependencies with `usageLedger?: ProviderUsageLedger` and `priceFor?: (providerId: string, modelId: string) => ModelPrice | undefined`. In `createRuntime`, accumulate the final successful response's usage part, calculate cost with the existing agent usage calculator, resolve the quota group by normalized model ID, choose the current account period, and call `ledger.record` once only after the stream ends without an error.

Construct the ledger in `index.ts`:

```ts
const usageLedger = new ProviderUsageLedger(path.join(app.getPath('userData'), 'connections', 'usage-ledger.json'))
providerManager = new ProviderManager({
  accountsFile: path.join(app.getPath('userData'), 'connections', 'accounts.json'),
  usageLedger,
  registry: providerRegistry,
  vault
})
```

After recording, increment the snapshot revision and emit a complete snapshot so Provider cards update without waiting for the 45-minute quota scheduler.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/connections-manager.test.ts tests/integration/provider-agent-chat.test.ts`

Expected: PASS with one request per completed response and zero for failed responses.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: attribute provider runtime usage"`

### Task 7: Preserve stale last-known-good quota and merge tracked periods

**Files:**
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/connections/snapshot.ts`
- Test: `tests/unit/connections-manager.test.ts`
- Test: `tests/unit/provider-snapshot.test.ts`

- [ ] **Step 1: Add failing stale-cache and period-selection tests**

Seed valid quota groups, make the next adapter refresh throw, and assert the groups, plan, and subscription expiry survive with `stale: true`, `refreshError`, and the prior `lastSuccessfulRefreshAt`. Add period selection assertions: weekly/monthly first, otherwise longest known window, otherwise `bs-local:<firstObservation>`.

```ts
expect(after.usage).toMatchObject({ quotaGroups: before.usage?.quotaGroups, stale: true, refreshError: 'network down', lastSuccessfulRefreshAt: before.usage?.refreshedAt })
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/connections-manager.test.ts tests/unit/provider-snapshot.test.ts`

Expected: FAIL because refresh errors currently resolve to unavailable usage or only keep the unmarked old object.

- [ ] **Step 3: Implement cache merge and active period selection**

Add pure helpers:

```ts
export function selectTrackedPeriod(usage: ProviderUsage | undefined, firstObservedAt: number): UsagePeriod
export function retainLastKnownUsage(previous: ProviderUsage | undefined, error: unknown, now: number): ProviderUsage
```

On a valid refresh, set `lastSuccessfulRefreshAt = refreshedAt`, clear stale/error flags, and merge the ledger's active account aggregate. On a failed refresh, preserve the prior valid quota data, set stale metadata, and never reactivate disabled accounts or recreate missing accounts. Only emit one complete snapshot revision for the refresh mutation.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/connections-manager.test.ts tests/unit/provider-snapshot.test.ts`

Expected: PASS; cached remaining percentages stay visible after a simulated network failure.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: retain stale provider quota snapshots"`

## Phase 3 — Compact quota dashboard

### Task 8: Build one quota presentation model for Providers and chat

**Files:**
- Modify: `src/renderer/src/components/quota/quota-view.ts`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Test: `tests/unit/quota-view.test.ts`
- Test: `tests/unit/quota-snapshot.test.tsx`

- [ ] **Step 1: Add failing all-groups and selected-model projections**

Given an account with Gemini and Claude/GPT groups, assert Providers receives both while an Agent using Claude receives only Claude/GPT. Assert two selected Agents on the same account using different families produce both groups once. Assert legacy fields map to a compatibility group without inventing a missing secondary window.

```ts
expect(providerQuotaGroups(usage).map(group => group.id)).toEqual(['gemini', 'claude-gpt'])
expect(chatQuotaGroups(usage, ['claude-sonnet-4-5']).map(group => group.id)).toEqual(['claude-gpt'])
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/quota-view.test.ts tests/unit/quota-snapshot.test.tsx`

Expected: FAIL because chat currently reduces `modelQuotas` into one fixed primary value and the card always assumes two windows.

- [ ] **Step 3: Implement the presentation functions**

Export:

```ts
export function providerQuotaGroups(usage?: ProviderUsage): ProviderQuotaGroup[]
export function chatQuotaGroups(usage: ProviderUsage | undefined, modelIds: string[]): ProviderQuotaGroup[]
export function quotaWindowState(window: ProviderQuotaWindow, now?: number): 'ready' | 'exhausted' | 'cooldown' | 'unknown'
```

Use `quotaGroups` first. Convert legacy primary/secondary only when present, tagging them `legacy-provider`. Never invert percentages in renderer. Keep account state distinctions for authentication, exhausted quota, capacity, cooldown, unavailable, and ready.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `npx vitest run tests/unit/quota-view.test.ts tests/unit/quota-snapshot.test.tsx`

Expected: PASS with no fixed model or fixed two-window fallback.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "refactor: project native quota groups for UI"`

### Task 9: Render compact full-width Provider cards and selected-Agent chat quota

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `tests/unit/quota-snapshot.test.tsx`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing component and browser assertions**

Assert Provider cards render identity/auth/plan/freshness/expiry, a collapsed deduplicated model summary, every reported group/window, a remaining progress bar with text, a compact `BS tracked` strip, and only Refresh/Reconnect/Activate-or-Deactivate/Remove actions. Assert chat shows selected Agent/model/speed and session metrics but no lifecycle actions or unrelated family.

Add Playwright checks at the default app size and a narrow Settings width:

```ts
await expect(window.locator('.provider-account-card').first()).toBeInViewport()
await expect(window.locator('.provider-account-card').first()).not.toHaveCSS('overflow-x', 'scroll')
await expect(window.locator('.quota-progress[aria-label*="remaining"]')).toBeVisible()
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/quota-snapshot.test.tsx`

Expected: FAIL because the current component renders fixed 5-hour/Weekly rows and four large metric tiles.

- [ ] **Step 3: Implement compact card variants and responsive styles**

Make `QuotaAccountCard` receive explicit normalized props instead of deriving fixed windows:

```ts
interface QuotaAccountCardProps {
  account: ProviderAccountSnapshot
  groups: ProviderQuotaGroup[]
  tracked?: ProviderTrackedUsage
  session?: { input: number; output: number; estimatedCost: number }
  agents?: AgentModelAssignment[]
  variant: 'provider' | 'chat'
  expandedModels?: boolean
  onToggleModels?: () => void
  onRefresh?: () => void
  onReconnect?: () => void
  onAccountToggle?: () => void
  onRemove?: () => void
  onSpeedChange?: (agentId: string, speed: AgentSpeed) => void
}
```

Render one full-width card per account in Providers. Use two quota columns when width permits and one column below the component breakpoint. The model list stays collapsed and expands into a bounded scroll region. A missing metric set renders one `BS usage not tracked yet` line. A stale card retains progress bars and adds `Stale · <age>` plus the concise refresh error.

For chat, pass only the selected native Agent to `RightPanelQuota`; show its matched family, friendly model, Standard/Fast switch, and current-session values. Do not render Refresh, Reconnect, Activate/Deactivate, or Remove in chat.

- [ ] **Step 4: Run focused GREEN, build, and E2E**

Run: `npx vitest run tests/unit/quota-view.test.ts tests/unit/quota-snapshot.test.tsx tests/unit/provider-dashboard.test.ts`

Expected: PASS.

Run: `npm run typecheck && npm run build && npm run e2e`

Expected: typecheck/build PASS and all Playwright tests PASS; at least one complete Provider card and one complete chat card fit without horizontal overflow.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: compact provider and chat quota dashboards"`

## Phase 4 — One shared native chat and unclipped Agent picker

### Task 10: Reconcile one selected native Agent and project one chat pane

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/PaneGrid.tsx`
- Modify: `src/renderer/src/components/Pane.tsx`
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Create: `tests/unit/shared-chat-selection.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing selection and one-pane tests**

Extract and test deterministic selection. The previous selected native Agent survives runtime refresh; deleting it falls back to the Agent named `bs`, then the first native Agent, then `null`. Terminal entries never become the native selection.

```ts
expect(resolveSelectedNativeAgent(agents, 'reviewer')).toBe('reviewer-id')
expect(resolveSelectedNativeAgent(agents.filter(a => a.id !== 'reviewer-id'), 'reviewer-id')).toBe('bs-id')
expect(projectVisiblePanes(agents, terminals, 'reviewer-id').filter(p => p.agent.kind === 'native')).toHaveLength(1)
```

Change the existing E2E Settings reconciliation case to assert one `.chat-panel`, Agent dropdown options `bs` and `reviewer`, session content changes after selection, and fallback to `bs` after deleting `reviewer`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/shared-chat-selection.test.ts`

Expected: FAIL because the selection/projection helpers do not exist and App currently maps every native Agent into a pane.

- [ ] **Step 3: Implement controlled native selection**

Export pure helpers from `App.tsx` or a focused adjacent module if React imports make unit isolation expensive:

```ts
export function resolveSelectedNativeAgent(agents: AgentConfig[], selectedId: string | null): string | null {
  const native = agents.filter(agent => agent.kind === 'native')
  if (selectedId && native.some(agent => agent.id === selectedId)) return selectedId
  return native.find(agent => agent.name === 'bs')?.id ?? native[0]?.id ?? null
}

export function projectVisiblePanes(nativeAgents: PaneModel[], terminalPanes: PaneModel[], selectedId: string | null): PaneModel[] {
  const selected = nativeAgents.find(pane => pane.agent.id === selectedId)
  return selected ? [selected, ...terminalPanes] : terminalPanes
}
```

Store `selectedNativeAgentId` in `App`. Reconcile it in an effect whenever the canonical workspace runtime changes. Pass the full native Agent option list and `onSelectNativeAgent` through `PaneGrid` and `Pane` to `ChatPanel`. Key the native `ChatPanel` by `agentId` so local UI state reloads from the main-process session store; this preserves separate conversations without rendering separate frames. Pass only the selected native Agent to chat quota.

Do not remove terminal panes, terminal zoom/focus, background process behavior, or main-process per-Agent sessions.

- [ ] **Step 4: Run GREEN and regression suites**

Run: `npx vitest run tests/unit/shared-chat-selection.test.ts tests/unit/renderer-agent-assignment.test.tsx tests/unit/workspace-agent-reconcile.test.ts`

Expected: PASS; add/remove runtime updates immediately change dropdown options and maintain one native chat frame.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "feat: use one shared native chat pane"`

### Task 11: Render the Agent dropdown in a viewport-safe portal

**Files:**
- Modify: `src/renderer/src/components/chat/AgentPicker.tsx`
- Create: `src/renderer/src/components/chat/agent-picker-position.ts`
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Modify: `src/renderer/src/styles.css`
- Create: `tests/unit/agent-picker-position.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing menu-position and interaction tests**

Test downward placement, upward flipping, left/right clamping, max-height, Escape close, outside-click close, arrow navigation, Enter selection, and focus restoration. In E2E, open the picker near the bottom edge and assert the menu bounding box is wholly inside the viewport and not clipped by `.pane`.

```ts
const pos = positionAgentPicker({ left: 760, top: 730, right: 900, bottom: 762, width: 140, height: 32 }, { width: 900, height: 768 }, { width: 270, preferredHeight: 300, gap: 4, margin: 8 })
expect(pos.placement).toBe('top')
expect(pos.left).toBeLessThanOrEqual(622)
expect(pos.top).toBeGreaterThanOrEqual(8)
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/unit/agent-picker-position.test.ts`

Expected: FAIL because the positioning helper does not exist and the menu is absolute inside an overflow-hidden pane.

- [ ] **Step 3: Implement controlled picker and fixed portal**

Use a controlled API:

```ts
interface AgentPickerProps {
  agents: Array<{ id: string; name: string; provider?: string; model?: string }>
  value: string
  onChange: (agentId: string) => void
}
```

Implement the pure position return type:

```ts
export interface AgentPickerPosition { left: number; top: number; maxHeight: number; placement: 'top' | 'bottom' }
export function positionAgentPicker(anchor: DOMRectLike, viewport: { width: number; height: number }, menu: { width: number; preferredHeight: number; gap: number; margin: number }): AgentPickerPosition
```

Render the menu with `createPortal(menu, document.body)`, `position: fixed`, and coordinates recalculated on open, resize, and capture-phase scroll. Clamp horizontal position and available height to the viewport. Use `role="listbox"`, `role="option"`, `aria-selected`, an active option index, Escape/outside click closure, and trigger focus restoration. Selecting an Agent calls `onChange(id)`; it must not call `setAgentProfile`.

- [ ] **Step 4: Run GREEN, build, and E2E**

Run: `npx vitest run tests/unit/agent-picker-position.test.ts tests/unit/shared-chat-selection.test.ts`

Expected: PASS.

Run: `npm run typecheck && npm run build && npm run e2e`

Expected: PASS; `.agent-picker-menu-portal` has a viewport-contained bounding box, selecting `reviewer` swaps the shared chat, and deleting it falls back to `bs` without creating a second `.chat-panel`.

- [ ] **Step 5: Review and commit**

Run: `git diff --check`

Commit: `git commit -m "fix: keep Agent picker visible above panes"`

## Phase 5 — Integrated verification and release evidence

### Task 12: Verify migration, connected accounts, responsive UI, and release notes

**Files:**
- Create: `docs/evidence/2026-08-23-provider-quota-shared-chat-verification.md`
- Modify: `docs/changelog-0.25.7.md`

- [ ] **Step 1: Run the focused quota and chat suites together**

Run:

```powershell
npx vitest run tests/unit/connections-usage.test.ts tests/unit/antigravity-usage.test.ts tests/unit/provider-antigravity-models.test.ts tests/unit/provider-usage-ledger.test.ts tests/unit/connections-manager.test.ts tests/unit/provider-snapshot.test.ts tests/unit/quota-view.test.ts tests/unit/quota-snapshot.test.tsx tests/unit/shared-chat-selection.test.ts tests/unit/agent-picker-position.test.ts
```

Expected: every listed file PASS with no skipped new acceptance test.

- [ ] **Step 2: Run all mandatory automated gates**

Run:

```powershell
npm run typecheck
npm test
npm run build
npm run e2e
git diff --check
```

Expected: typecheck PASS, all Vitest files/tests PASS, Electron build PASS, all Playwright tests PASS, and no whitespace errors.

- [ ] **Step 3: Perform connected-account running-app checks**

Run `npm run dev` and record observed results for:

- OpenAI Plus/Pro card identity, raw plan, provider-reported expiry or explicit `not reported`, every returned window, correct reset countdown, remaining percentages, and no duplicate models.
- Antigravity Pro identity, Gemini and Claude/GPT groups when returned, account models, no API-key warning, and no fabricated Weekly row when upstream omits it.
- Refresh failure simulation or temporary offline refresh retaining stale last-known-good values.
- One complete Provider card at default Settings size and one complete chat card at default right-panel size without horizontal overflow.
- Standard/Fast switch updating the selected Agent only.
- Creating `reviewer` updates the Agent picker immediately; selecting it changes chat/session/quota; deleting it falls back to `bs`; exactly one native `.chat-panel` remains.
- Picker menu remains fully visible when opened at the bottom/right edge and is keyboard operable.

For unavailable upstream metadata, record `Not reported by provider`; do not convert that into a failed observation.

- [ ] **Step 4: Write evidence and changelog**

The evidence note must contain: date/time, branch/commit, command outputs with pass counts, connected account/provider labels with secrets redacted, viewport sizes, observed quota group/window labels, screenshots or absolute local screenshot paths, and a pass/fail row for each acceptance criterion. Update the changelog using `docs/changelog-format.md`, describing accurate remaining quota, compact cards, BS-tracked usage, shared chat, and the unclipped Agent picker.

- [ ] **Step 5: Final diff audit and commit**

Run:

```powershell
git status --short
git diff --stat
git diff --check
```

Confirm no vault, token, `accounts.json`, `usage-ledger.json`, raw provider payload, or unrelated dirty file is staged.

Commit only evidence/changelog and any test-only corrections from this task with: `git commit -m "docs: verify quota dashboard and shared chat"`

## Acceptance mapping

| Approved requirement | Implemented and proved by |
|---|---|
| OpenAI seconds/milliseconds reset correctness | Tasks 1–2 |
| Only provider-reported OpenAI windows and additional limits | Task 2 |
| Antigravity Gemini and Claude/GPT groups with ordered fallback | Task 3 |
| No fabricated plan, expiry, window, or percentage | Tasks 1–3, 8–9 |
| Exact account/model request-token-cost attribution | Tasks 5–7 |
| Canonical deduplicated model summary | Task 4 and Task 9 |
| Full compact card fits default layouts | Task 9 and Task 12 |
| Stale last-known-good quota survives refresh failure | Task 7 |
| Providers lifecycle actions only; chat speed action only | Task 9 |
| One shared native chat while terminal panes remain separate | Task 10 |
| Live Agent add/delete reconciliation and deterministic fallback | Task 10 |
| Dropdown cannot be clipped and supports keyboard/focus | Task 11 |
| All mandatory automated and running-app gates | Task 12 |

## Definition of complete

This plan is complete only when all task checkboxes are checked, every focused RED failure and GREEN pass has been observed, all five final commands pass, connected OpenAI and Antigravity observations are recorded without credentials, exactly one native chat frame remains through Agent create/switch/delete, and the evidence note contains no unresolved failed row.
