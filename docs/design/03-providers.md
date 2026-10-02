# Providers

How BS Coding holds many accounts across many providers and decides which one can
take the next turn. Quota is not a dashboard here — it is the input to that
decision, which is why its accuracy is treated as correctness rather than
presentation.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 20-38 | `src/main/providers/types.ts`, `ProviderAdapter`, `src/main/providers/registry.ts`, `src/main/providers/adapters/openai.ts`, `src/main/providers/adapters/antigravity.ts`, `src/main/providers/adapters/github-copilot.ts` |
| [Data flow](#data-flow) | 39-110 | `ProviderManager.createAuthorization`, `ProviderAuthorizationStrategy`, `slow_down`, `usageMetadata`, `stream_options.include_usage`, `https://api.github.com/copilot_internal/user` |
| [Types that carry it](#types-that-carry-it) | 111-131 | `ProviderAdapter`, `refreshAccount`, `listModels`, `createRuntime`, `refreshCredentials`, `recoverRuntimeContext` |
| [Design decisions](#design-decisions) | 132-176 | `ProviderUsage.status`, `'near-limit'`, `docs/technical-debt.md`, `primaryUsedPercent`, `providerError`, `hasRemainingQuota` |
| [Choosing a replacement when a pool is refused](#choosing-a-replacement-when-a-pool-is-refused) | 177-178 |  |
| &nbsp;&nbsp;[Agent quota reservations](#agent-quota-reservations) | 179-214 | `src/shared/agent-quota-binding.ts`, `quotaPoolId`, `rankFallbackAgents`, `src/shared/agent-fallback.ts`, `poolState`, `SessionRunner` |
| [Known limits](#known-limits) | 215-225 | `openai.ts`, `antigravity.ts`, `github-copilot.ts`, `fetchUsage`, `poolErrors` |
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

**Connecting.** `ProviderManager.createAuthorization` dispatches the adapter's
`ProviderAuthorizationStrategy`. Callback strategies build an authorization URL
with PKCE, listen on loopback, and complete the code exchange. GitHub Copilot uses
the device variant: request a grant, expose its user code and verification URL,
and poll at the provider's interval. `slow_down` increases that interval. Cancel,
expiry and app shutdown abort waits/requests and prevent late account persistence.
Only the user code crosses IPC; the private device grant remains inside the
completion closure. Profile and Copilot entitlement must succeed before account
connection. Failed/cancelled reconnect rolls back existing account and secrets.
The account lands in the store and secrets in the encrypted vault.

GitHub REST requests use the supported `2022-11-28` API version for profile,
private email and Copilot credentials. An unsupported date produces HTTP 400
even after OAuth succeeds. Profile failures preserve their HTTP status in the
public authorization error, with no token or response body exposed.

**Stream usage.** Antigravity's Cloud Code transport reads response-level
`usageMetadata`, including a final usage-only frame after the candidate stops.
Prompt counts include cached tokens, while candidate output and thinking are
combined for output; cache remains a separate cost counter. Generic compatible
streams request `stream_options.include_usage`. Endpoints rejecting that option
explicitly can be retried without it before output; missing usage is unknown.
Exact assigned-account model capabilities take priority over catalog limits,
with no inference from another provider's similarly named model.

**Copilot account entitlement.** The adapter reads
`https://api.github.com/copilot_internal/user` with the GitHub identity token,
never its short-lived Copilot runtime token. Premium requests, Chat and
Completions use reported counts, percentages, Unlimited markers and reset dates.
AI credits used is shown when returned; a credit allowance/remaining balance is
not inferred from the plan. New OAuth connections request quota immediately;
account Refresh and polling preserve stale prior data on API failure. Runtime-only
imports expose an OAuth reconnect hint; explicitly imported identity tokens are
retained. These account windows are informational for routing because the payload
does not establish individual model premium multipliers/eligibility.

**Copilot model discovery.** The adapter fetches `/models` on the account's
trusted Copilot API endpoint with a runtime credential. Exact IDs, labels,
streaming/tool capabilities and context/output limits replace the old static
two-model list. Picker must explicitly be enabled and policy state must be
`enabled`; missing permission metadata is excluded. Plan restrictions and
explicit supported endpoints also filter the catalog. Chat Completions and Responses are supported; Messages-only
models and unsupported capability shapes are not offered. If endpoint metadata
is absent, a known tool-capable streaming chat model uses the legacy compatible
transport. Missing context capacity is not inferred from prompt-only limits.

Token issuance may advertise an account-specific API base URL. HTTPS and a
Copilot-owned API hostname are validated before either catalog or inference
credentials are sent. Imports fetch catalog before persistence, OAuth hydration
fetches after identity/token issuance, and Refresh uses the same discovery path.
Errors/empty compatible catalogs retain prior persisted models with refresh
failure state; selected assignments/history are not silently changed. Snapshot
capability marks Copilot model discovery as remote.

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

## Choosing a replacement when a pool is refused

### Agent quota reservations

`src/shared/agent-quota-binding.ts` defines account/pool bindings and allowed
models for both Settings and the main process. Distinct agent profiles cannot
reserve the same provider/account/pool. Antigravity provides Gemini and
Claude/GPT pools; current other providers use one account pool. Different time
windows constrain the same quota and do not provide additional agent slots.

`quotaPoolId` is persisted with the profile and assignment. Model switching in
chat is limited to the pool's current account catalog. Missing catalogs and
unknown Antigravity model families never widen the selection. Existing
duplicate profiles are kept; conflicting assignments require Settings review.
The same global profile may appear in multiple projects, with a separate
runtime ID, without claiming another quota slot.

A quota or capacity refusal does not end the turn while another agent can carry
it. `rankFallbackAgents` in `src/shared/agent-fallback.ts` orders the project's
other ready agents by how close each is to the one refused: same provider and
model on another account, then the same provider with another model, then
another provider. Inside a tier the declaration order stands, because the
trigger is exhaustion and draining one account before starting the next matches
what is happening.

A candidate must also be in the **same mode** as the agent it replaces. Modes
carry different tool sets, so a plan or coordinate agent cannot carry a build
turn, and a worker handed a coordinating turn would do the work instead of
assigning it.

Remaining quota never reorders that list. It only removes a candidate whose pool
`poolState` already reports as spent — which matters because two agents on
different models can draw on one pool, so a spent pool rules out both.

The swap happens inside one turn. `SessionRunner` asks `currentTarget` who to
call at each step and `handoff` whether anyone will take over, so the loop never
learns what an agent is, and the turn keeps one id and one snapshot.

## Known limits

`openai.ts`, `antigravity.ts` and `github-copilot.ts` implement `fetchUsage`. Generic
openai-compatible accounts report no quota, no reset window and no term, which
caps how well work can be balanced across providers — debt item 2.

The reason string still carries no group scope, but it is no longer the only
record: `poolErrors` names the refused pool, and the group row on the quota
card reads it. The UI can now say which group is not fine, which for most of
this project's life it could not.
