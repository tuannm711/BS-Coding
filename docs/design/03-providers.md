# Providers

How BS Coding holds many accounts across many providers and decides which one can
take the next turn. Quota is not a dashboard here — it is the input to that
decision, which is why its accuracy is treated as correctness rather than
presentation.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 18-36 | `src/main/providers/types.ts`, `ProviderAdapter`, `src/main/providers/registry.ts`, `src/main/providers/adapters/openai.ts`, `src/main/providers/adapters/antigravity.ts`, `src/main/providers/adapters/github-copilot.ts` |
| [Data flow](#data-flow) | 37-59 | `ProviderManager.connect`, `ProviderAuthorizationStrategy`, `MainApp.startUsagePoll`, `ProviderManager.refreshUsage`, `adapter.refreshCredentials`, `adapter.fetchUsage` |
| [Types that carry it](#types-that-carry-it) | 60-80 | `ProviderAdapter`, `refreshAccount`, `listModels`, `createRuntime`, `refreshCredentials`, `recoverRuntimeContext` |
| [Design decisions](#design-decisions) | 81-125 | `ProviderUsage.status`, `'near-limit'`, `docs/technical-debt.md`, `primaryUsedPercent`, `providerError`, `hasRemainingQuota` |
| [Known limits](#known-limits) | 126-136 | `openai.ts`, `antigravity.ts`, `fetchUsage`, `poolErrors` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/providers/types.ts` | `ProviderAdapter` — the contract every provider implements |
| `src/main/providers/registry.ts` | Maps a provider id to its adapter |
| `src/main/providers/adapters/openai.ts` | ChatGPT / Codex over OAuth, plus API-key mode |
| `src/main/providers/adapters/antigravity.ts` | Google Antigravity over Cloud Code |
| `src/main/providers/adapters/github-copilot.ts` | GitHub Copilot |
| `src/main/providers/adapters/openai-compatible.ts` | Any OpenAI-shaped endpoint |
| `src/main/providers/antigravity-models.ts` | Parses Cloud Code quota payloads into groups and windows |
| `src/main/providers/auth/` | OAuth flows, the PKCE login session, and import normalisation |
| `src/main/connections/manager.ts` | `ProviderManager`: accounts, refresh, usage polling |
| `src/main/connections/store.ts` | Account persistence; secrets go to the vault |
| `src/main/connections/usage.ts` | `normalizeUsage`, `selectTrackedPeriod` |
| `src/main/connections/usage-ledger.ts` | Per-period request and token accounting |
| `src/main/vault.ts` | Secrets encrypted with Electron `safeStorage` |
| `src/renderer/src/components/quota/quota-view.ts` | The pure view model every quota surface shares |

## Data flow

**Connecting.** `ProviderManager.connect` asks the adapter's
`ProviderAuthorizationStrategy` to `build` an authorization URL with PKCE,
listens on the loopback callback port, then `complete`s the exchange. The account
lands in the store and the secrets in the vault, encrypted.

**Refreshing usage.** `MainApp.startUsagePoll` runs every five minutes, and a
debounced refresh fires a few seconds after any agent turn ends.
`ProviderManager.refreshUsage` walks every account, calls
`adapter.refreshCredentials` then `adapter.fetchUsage`, and writes the result
back. A failed refresh keeps the last known quota rather than blanking the card.

**Rendering.** Both quota surfaces — the Providers tab and the chat panel — read
the same pure functions in `src/renderer/src/components/quota/quota-view.ts`.
`quotaAccountState` reduces an account to one of six UI states, and
`providerQuotaGroups` / `chatQuotaGroups` decide which groups to show.

**Chatting.** `createRuntime` turns an account, its secrets and a model into an
`LlmClient`, which is what `docs/design/02-agent-runtime.md` consumes. If the
provider reports that the runtime entity vanished, `recoverRuntimeContext`
rediscovers it rather than failing the turn.

## Types that carry it

`ProviderAdapter` is deliberately small. `connect`, `refreshAccount`,
`listModels` and `createRuntime` are required; `authorization`,
`refreshCredentials`, `recoverRuntimeContext` and `fetchUsage` are optional, so a
provider implements only what it can support.

The quota model has three levels:

- `ProviderQuotaWindow` — one limit: `kind` (`session`, `weekly`, `monthly`,
  `additional`, `unknown`), `remainingPercent`, `resetAt`, and `usageKnown` so a
  window that exists but reports nothing is distinguishable from one at zero.
- `ProviderQuotaGroup` — a family of models sharing windows, with the `modelIds`
  it covers. Antigravity reports two: `gemini` and `claude-gpt`.
- `ProviderUsage` — the account-level record: the groups, `primaryUsedPercent`,
  `status`, `unavailableReason`, `subscriptionExpiresAt`, and `tracked`.

`ProviderTrackedUsage` is what BS Coding counted itself — requests, tokens,
estimated cost — keyed by `periodKey` from `selectTrackedPeriod`, which anchors
the period to the provider's own weekly or longest window.

## Design decisions

**`ProviderUsage.status` carries two values, not four.** It was
`'ok' | 'near-limit' | 'expired' | 'unavailable'`, but every branch in the
codebase only ever asked whether it was `'unavailable'`. The other three were
indistinguishable to all five consumers, and the three thresholds producing
`'near-limit'` disagreed with each other at `>= 90`, `<= 20` and `<= 0.2`. The
union was narrowed to what is actually read. A routing signal, when one is needed,
should be chosen deliberately — debt item 1 in `docs/technical-debt.md`.

**An account-level exhaustion warning is suppressed while any window has quota.**
A 429 is stored on the account, but its message names the single model that was
refused. Three separate defects came from that one shape: `primaryUsedPercent`
pinned by a hidden helper model, the reason printed over a healthy group, and the
`providerError` badge reading "Quota exhausted" at 93.92% remaining. All three are
fixed in the view layer by `hasRemainingQuota` and `accountWarning`. Since
v1.2.0 the stored state carries the scope too: a quota refusal is written to
`ProviderAccount.poolErrors` under the pool that was refused, resolved by
asking the adapter which pool the model draws on.

**One state machine, shared.** `quotaAccountState` used to be duplicated as an
inline ternary in the Providers tab, which is why a fix landed on the chat panel
and missed Settings. It now lives in `quota-view.ts` and both surfaces call it.

**Explicit provider errors are gated too.** An `account.error` of kind
`quota-exhausted` means a request was actively refused — a stronger signal than a
stale reason string, but refused for one model in one group, not for the account.
Scope, not strength, is what decides.

**The ChatGPT subscription term is read from the id_token, not fetched.** The
`https://api.openai.com/auth` claim carries `chatgpt_subscription_active_until`
alongside `chatgpt_account_id` and `chatgpt_plan_type`. The HTTP route was
measured and does not work: `accounts/check/v4` answers a Codex bearer with 403,
and `/backend-api/subscriptions` sits behind an account id that was never
populated, because the decoder looked for `account_id` where the provider emits
`chatgpt_account_id`.

**Antigravity reports no subscription term at all.** Every key of the
`loadCodeAssist` response was captured and none is a date. Nothing is synthesised
from the tier id — debt item 3.

**Secrets never leave the main process.** The vault encrypts with Electron
`safeStorage`, which is DPAPI on Windows, so the file cannot be decrypted by
another process even as the same user. The renderer receives masked values only.

## Known limits

Only `openai.ts` and `antigravity.ts` implement `fetchUsage`. GitHub Copilot and
openai-compatible accounts report no quota, no reset window and no term, which
caps how well work can be balanced across providers — debt item 2.

The reason string still carries no group scope, but it is no longer the only
record: `poolErrors` names the refused pool, and the group row on the quota
card reads it. The UI can now say which group is not fine, which for most of
this project's life it could not.
