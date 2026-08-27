# Provider Quota Accuracy and Compact Dashboard Design

Date: 2026-08-23
Status: Approved for implementation planning

## 1. Goal

Make provider and chat quota information accurate, complete when the upstream source exposes it, and compact enough to show at least one useful account card without overflow. The Providers view shows every quota family reported for an account. The chat right panel shows only the quota family used by the current Agent/model.

The design keeps BS Coding account management actions and does not copy Cockpit actions that only launch, tag, annotate, export, or otherwise manage external applications.

## 2. Current Problems and Root Causes

### 2.1 Incorrect fixed-window presentation

`QuotaAccountCard` always renders a `5-hour window` and a `Weekly window`, even when a provider did not report one or both windows. This turns missing data into misleading empty rows and makes every provider look like OpenAI.

`ProviderUsage` stores generic `primaryUsedPercent` and `secondaryUsedPercent`, so the renderer loses provider-native labels, family ownership, presence flags, window duration, and the source of each value.

### 2.2 Incorrect timestamp normalization

OpenAI `reset_at` values can be Unix seconds. The current parser passes them directly to renderer functions that expect JavaScript milliseconds. A valid future reset therefore appears in 1970 and renders as `Reset 0m`.

### 2.3 Antigravity data is flattened too early

The current Antigravity path reads `fetchAvailableModels`, retains one quota value per model, then reduces all models to the most constrained value. This loses the native Gemini versus Claude/GPT family structure and cannot represent separate five-hour and weekly buckets.

Antigravity's richer quota summary can expose `response.groups[].buckets[]`, with separate Gemini and Claude/GPT groups and named session/weekly windows. Remote OAuth responses can be less complete than the local Antigravity app or `agy` language-server response. BS Coding remains OAuth-only and in-app for this feature: it will query the official remote quota endpoints but will not launch or manage an external CLI/app to fill missing fields.

### 2.4 Model duplication and excessive vertical space

Provider model catalogs can contain aliases and repeated entries. Providers currently renders every model as a chip before the account card. Status stages, identity, actions, two fixed quota rows, and four large metric tiles produce unnecessary vertical height.

### 2.5 Usage metrics have unclear provenance

Provider quota endpoints do not consistently return request count, token input/output, or billed amount. The existing card falls back to current-session telemetry without clearly distinguishing account-period data from session data. The result can look like provider billing data when it is only a local estimate.

## 3. Scope

### In scope

- A normalized native quota-group contract.
- Correct OpenAI window, reset, plan, and subscription parsing.
- Antigravity remote quota summary/fallback parsing and canonical model-family grouping.
- Persistent account-period request/token/cost telemetry recorded by BS Coding.
- Compact Providers and chat quota cards.
- Stale-data retention, explicit unavailable states, migration, tests, and documentation.

### Out of scope

- Launching or managing Cockpit, Antigravity, `agy`, Codex CLI, or other external applications.
- Scraping third-party desktop interfaces.
- Claiming a weekly/session quota that the selected upstream source did not report.
- Reproducing Cockpit note, tag, terminal, export, reset-credit, API binding, multi-instance, or external-app controls.
- Presenting locally estimated cost as provider invoicing.

## 4. Source-of-Truth Rules

1. Provider-reported quota and BS-tracked usage are separate sources.
2. A quota window is rendered only when its presence is confirmed by a provider payload or a well-defined legacy payload mapping.
3. Remaining percentage is normalized exactly once in main. Renderer components consume `remainingPercent`; they never invert `used_percent` themselves.
4. Reset timestamps are normalized to milliseconds at the adapter boundary. Numeric values below `10_000_000_000` are Unix seconds; larger numeric values are milliseconds. ISO-8601 strings are parsed directly.
5. OAuth access-token expiry is credential metadata, not subscription expiry.
6. A refresh error never replaces a valid cached quota snapshot with an empty one. The cached snapshot becomes stale and carries the latest refresh error.
7. Missing information is shown as concise `Not reported` text where context requires it; empty progress bars and large tiles are not created.

## 5. Shared Data Contract

Add provider-native quota groups while retaining legacy fields during migration:

```ts
interface ProviderQuotaWindow {
  id: string
  label: string
  kind: 'session' | 'weekly' | 'monthly' | 'additional' | 'unknown'
  remainingPercent?: number
  resetAt?: number
  windowMinutes?: number
  usageKnown: boolean
  source: 'provider' | 'legacy-provider'
}

interface ProviderQuotaGroup {
  id: string
  label: string
  modelIds: string[]
  windows: ProviderQuotaWindow[]
}

interface ProviderTrackedUsage {
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

interface ProviderUsage {
  // existing identity, state, plan, expiry, freshness and legacy fields
  quotaGroups?: ProviderQuotaGroup[]
  tracked?: ProviderTrackedUsage
  lastSuccessfulRefreshAt?: number
  stale?: boolean
  refreshError?: string
}
```

`ProviderAccountSnapshot.models` remains the safe account catalog. Snapshot construction deduplicates models by canonical persisted ID while preserving the provider transport ID separately.

## 6. OpenAI Normalization

### 6.1 Quota request

Continue using the ChatGPT account-scoped OAuth headers. Request `wham/usage` first and retain the Codex usage fallback. Parse:

- `rate_limit.primary_window`;
- `rate_limit.secondary_window`;
- legacy root and `rate_limits.primary/secondary` shapes;
- `additional_rate_limits[].rate_limit.primary_window/secondary_window` when present.

### 6.2 Window mapping

- `used_percent` becomes `remainingPercent = clamp(100 - used_percent)`.
- `limit_window_seconds` determines `windowMinutes` and the display label.
- Primary and secondary are not assumed present. Presence is based on the actual object.
- A 300-minute window is labelled `5-hour`; a 10,080-minute window is labelled `Weekly`. Unknown durations use the provider label or `Additional limit`.
- `reset_at` and `reset_after_seconds` are normalized to milliseconds.
- Additional limits retain a stable ID and label rather than being merged into the base OpenAI limit.

### 6.3 Account metadata

- Plan comes from `wham/usage`, account-check, subscription response, or verified token profile in that priority order.
- Subscription expiry comes only from account/subscription fields such as `subscription_active_until`, `end_date`, or `ends_at`.
- If a connected account has no subscription expiry, show `Subscription expiry not reported`; do not use OAuth token expiry.

## 7. Antigravity Normalization

### 7.1 In-app OAuth source order

For the connected OAuth account, use this remote source order:

1. `POST .../v1internal:retrieveUserQuotaSummary`;
2. `POST .../v1internal:retrieveUserQuota`;
3. the quota information returned by `fetchAvailableModels`.

All requests use the account's existing access token, resolved Cloud Code project, and remote Cloud Code base URL. A richer response wins only when it matches the selected account and contains known quota values. BS Coding does not start or inspect a local Antigravity/`agy` process.

### 7.2 Preferred grouped response

Parse `response.groups[].buckets[]`:

- `Gemini Models` becomes group `gemini`.
- `Claude and GPT models` and `3p-*` become group `claude-gpt`.
- `gemini-5h`/`3p-5h` map to `session`.
- `gemini-weekly`/`3p-weekly` map to `weekly`.
- `remaining.remainingFraction` or `remainingFraction` maps to remaining percentage.
- Bucket `resetTime`, description, window and label are preserved.

### 7.3 Legacy model response

If only per-model `quotaInfo` exists:

- Canonicalize aliases first.
- Group Gemini text models into `gemini`.
- Group Claude and GPT/GPT-OSS text models into `claude-gpt`.
- Exclude autocomplete, Lite helper, image, and hidden transport variants from representative summary selection, while retaining valid code models in the model catalog.
- Use the most constrained representative remaining value for the group.
- Render only the reset/window that can be identified from the response. Do not synthesize Weekly.
- Rows containing reset context but no remaining fraction use `usageKnown: false`; they do not appear as exhausted quota.

### 7.4 Plan and expiry

Plan comes from `loadCodeAssist` tier fields or quota-summary account metadata. Subscription expiry is displayed only if the upstream response provides a subscription term. Access-token expiry is not a subscription term.

## 8. BS-Tracked Account Ledger

Create a main-process persistent ledger under `userData/connections/usage-ledger.json`. Only main reads or writes it.

Each successful model response records:

- provider ID and account ID;
- canonical model ID and quota-group ID;
- one request;
- input, cache-read/cache-write, and output tokens;
- locally estimated cost using the model price table;
- timestamp.

The Provider runtime wrapper is the authoritative attribution boundary because it already knows `providerId`, `accountId`, and `modelId`. BsAgentManager session events remain the source for current-session metrics but do not own account totals.

### 8.1 Period selection

- Prefer the reported weekly/current billing window for account-period metrics.
- When no weekly/monthly window is reported, use the active provider window with the longest known duration.
- When no period exists, start a local bucket at first observation and label it `BS tracked since <time>`.
- A changed reset boundary creates a new bucket. Retain a bounded history for diagnostics, but expose only the active bucket in normal cards.
- The first release starts tracking at upgrade time; it does not reconstruct historical totals from sessions that lack reliable account attribution.

### 8.2 Counting rules

- A completed provider response increments requests once.
- Token input includes cache tokens in the displayed input total, with cache retained internally as a separate field.
- Failed attempts may be stored for diagnostics but do not increment the successful request metric.
- `estimatedBilled` is always labelled `BS tracked` or `session estimate`; never `Account billed` without an upstream billing source.

## 9. Providers UI

One connected account occupies one compact full-width row/card.

### Header

- Avatar, account label/email, provider/auth mode.
- Active/inactive state, raw plan badge, freshness.
- Subscription expiry or `Subscription expiry not reported` in a compact metadata line.

### Models

- Deduplicated summary such as `28 code models` plus two or three representative names.
- `View` expands an inline bounded, scrollable model list.
- The list is collapsed by default and does not reserve height.

### Quota

- Render all account quota groups.
- Two columns when space allows; stack at narrow width.
- Each group shows only its reported windows with remaining progress and reset countdown.
- Progress bars represent remaining quota and always include a textual percentage.

### Metrics and actions

- Requests, token input, token output, and estimated billed render as one compact metric strip labelled `BS tracked`.
- Omit a metric cell only when the ledger has never observed it; show one concise `BS usage not tracked yet` message instead of four empty tiles.
- Keep only Refresh, Reconnect, Activate/Deactivate, and Remove.
- Credentials/models/usage stage states collapse into one compact readiness badge; detailed stage text appears only when refreshing or when a stage failed.

## 10. Chat Right-Panel UI

- Group rows by provider account.
- Within an account, show only quota groups matching models assigned to active session Agents.
- If Agents on the same account use both Gemini and Claude/GPT, show two small family sections in the same account card.
- Show Agent name, friendly model name, and Standard/Fast control.
- Show current-session input/output tokens and estimated cost, not account-period totals.
- Exclude provider lifecycle actions.
- The first account card must fit within the quota panel viewport at the current default app size without clipping or horizontal overflow.

## 11. Stale and Error States

- Preserve the latest successful quota groups when a later refresh fails.
- Mark retained data `Stale · <age>` and attach a concise refresh error.
- Keep these states distinct: ready, usage unavailable, quota exhausted, capacity exhausted, cooldown, and authentication expired.
- A provider error affecting one model does not overwrite healthy account-family quota.
- An unavailable source renders no percentage bar unless a cached known percentage exists.
- Refresh is idempotent and does not reactivate disabled accounts or recreate removed accounts.

## 12. Migration and Compatibility

- Read legacy `primaryUsedPercent`, `secondaryUsedPercent`, and `modelQuotas` into a temporary compatibility view.
- A successful provider refresh writes `quotaGroups` and keeps legacy fields only while old consumers remain.
- Do not delete a valid legacy cached quota until a new valid snapshot exists.
- Snapshot revisions continue to guard renderer ordering.
- Existing Agent provider/account/model assignments are unchanged.
- The usage ledger begins empty and is versioned independently from provider accounts.

## 13. Security

- Quota snapshots contain safe metadata only.
- OAuth access/refresh tokens and account transport credentials remain in the main-process vault.
- Raw provider response bodies are not sent over IPC and are not included in user-visible errors.
- Usage-ledger files contain account IDs, model IDs, counters, and estimates but no credentials or prompt content.

## 14. Testing

### Parser coverage

- OpenAI current and legacy shapes.
- Missing primary/secondary windows.
- Additional rate limits.
- Unix seconds, milliseconds, relative resets, and ISO timestamps.
- Plan and subscription metadata without confusing token expiry.
- Antigravity grouped quota summary and legacy per-model quota.
- Gemini versus Claude/GPT classification, alias deduplication, hidden-model exclusion, and unknown usage.

### Ledger coverage

- Exact account/model attribution.
- Request and token counting including cache breakdown.
- Successful versus failed request rules.
- Model pricing and estimated cost.
- Reset-boundary rollover, persistence, bounded history, and restart recovery.

### Snapshot and UI coverage

- Providers renders every family and reported window.
- Chat renders only the selected Agent families.
- Agent/model changes update the chat card immediately.
- Refresh failure retains stale last-known-good data.
- Model summary is deduplicated and collapsed.
- Missing values do not create fake empty windows or four large empty metric tiles.
- Keyboard focus, progress semantics, text status, narrow Settings layout, and right-panel overflow.

### Required gates

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run e2e`
- `git diff --check`

## 15. Acceptance Criteria

1. OpenAI reset timestamps no longer incorrectly display `0m` because of seconds/milliseconds mismatch.
2. OpenAI cards show only windows returned by the account endpoint and include additional limits when present.
3. Providers shows all known Antigravity Gemini and Claude/GPT quota families; chat shows only the families used by active Agents.
4. No quota, reset, plan, or subscription expiry is fabricated from unrelated fields.
5. Requests/tokens/cost are persistently attributed to the exact account and clearly labelled `BS tracked`.
6. Provider model lists contain no duplicate canonical model rows and are collapsed by default.
7. At least one complete card is visible at the default Settings and right-panel sizes without overflow.
8. Refresh failure preserves and labels the last known good snapshot.
9. Only BS Coding provider lifecycle and Agent speed actions are present.
10. All mandatory verification gates pass.

## 16. References

- Cockpit Tools Codex quota model and remaining-percentage semantics: `jlcodes99/cockpit-tools`, `crates/cockpit-core/src/modules/codex_quota.rs` and `src/types/codex.ts`.
- Cockpit Tools Antigravity canonical model mapping: `src/utils/antigravityModels.ts` and `src/types/account.ts`.
- Antigravity grouped quota protocol and OAuth limitations: `steipete/CodexBar`, `docs/antigravity.md`.
- Approved visual companion mockup: `.superpowers/brainstorm/1988-1787484030/content/quota-layout.html` (excluded from git).
