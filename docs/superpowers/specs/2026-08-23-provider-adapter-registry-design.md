# BS Coding Provider Adapter Registry

**Status:** Draft for review  
**Date:** 2026-08-23  
**Scope:** Use provider credentials and models inside BS Coding Agents and chat only. BS Coding does not launch or manage Cockpit/provider CLI applications.

## 1. Goals

The provider system must make every connected provider usable from the same Agent and chat workflow while preserving provider-specific authentication and request details.

The system must:

- show only connected accounts in Settings → Providers;
- connect an account through a modal opened by an Add provider split/dropdown button;
- expose provider-specific methods such as OAuth, API key, local credential import and token/JSON import;
- support multiple accounts per provider, with independent Active/Inactive state;
- keep all secrets in the main-process Vault;
- expose provider/model/account choices to Agent configuration and chat;
- provide a common model catalog contract and provider-specific filtering (OpenAI OAuth remains code-model-only);
- expose quota and usage through a common normalized shape when a provider supports it;
- use the approved vertical full-width quota card for every connected account.

Non-goals:

- launching, supervising or automating external provider CLIs/apps;
- reproducing Cockpit's complete UI or local runtime;
- fabricating quota when a provider has no supported usage endpoint;
- allowing renderer code to read access tokens, API keys or imported credential files.

## 2. Design principles

The core owns lifecycle, persistence, IPC and security. Provider adapters own provider-specific behavior. The renderer consumes safe metadata and never receives secrets. Adding a provider should require a new adapter and registration, not changes to Agent, chat or generic Settings logic.

All provider operations are account-scoped. A provider can have zero, one or many accounts. An Agent assignment references `providerId`, `accountId` and `model`; account selection must reject disabled, expired or error accounts.

## 3. Architecture

### 3.1 Core services

`ProviderRegistry` is the read-only catalog of adapter capabilities. `ProviderManager` orchestrates account lifecycle and delegates provider behavior to an adapter. `ProviderAccountStore` persists safe metadata and encrypted secret references. `ProviderRuntime` creates an LLM client/request transport from an active account assignment.

Suggested boundaries:

```text
ProviderRegistry
  └─ ProviderAdapter[]
ProviderManager
  ├─ ProviderAccountStore + Vault
  ├─ AuthSessionCoordinator
  ├─ ModelCatalogService
  ├─ UsageService
  └─ ProviderRuntime
AgentManager / Chat
  └─ ProviderRuntime.send(assignment, request)
```

`src/shared` contains contracts only. Adapter implementations and secret handling stay in `src/main/providers` and `src/main/connections`. The renderer uses `window.api` through centralized `Channels` entries.

### 3.2 Adapter contract

The exact TypeScript contract will be finalized in the implementation plan, but each adapter must provide these capabilities:

```ts
interface ProviderAdapter {
  id: string
  displayName: string
  methods: AuthMethodDescriptor[]
  connect(method: AuthMethod, input: AuthInput, ctx: ProviderContext): Promise<ConnectedAccount>
  refresh?(account: ProviderAccount, secret: ProviderSecret, ctx: ProviderContext): Promise<RefreshedSecret>
  listModels(account: ProviderAccount, secret: ProviderSecret, ctx: ProviderContext): Promise<ProviderModel[]>
  createClient(account: ProviderAccount, secret: ProviderSecret, model: ProviderModel, ctx: ProviderContext): LlmClient
  fetchUsage?(account: ProviderAccount, secret: ProviderSecret, ctx: ProviderContext): Promise<ProviderUsage>
  disconnect?(account: ProviderAccount, secret: ProviderSecret, ctx: ProviderContext): Promise<void>
}
```

`AuthMethodDescriptor` includes a stable method id, label, description, required fields, whether it opens a browser, whether it imports a file, and whether it supports multiple accounts. `AuthInput` is accepted only in main process and is erased after persistence.

The adapter may declare model capabilities (`speedModes`, `contextWindow`, `supportsStreaming`, `supportsTools`, `isCodeModel`). The generic Agent layer uses these flags to validate assignments and render controls.

## 4. Provider capability matrix

The first registry entries mirror Cockpit's supported connection patterns but are implemented for in-app Agent use:

| Provider family | Initial connection methods | Model/request handling | Usage/quota |
|---|---|---|---|
| OpenAI / ChatGPT | OAuth, API key | OAuth exposes coding models only; API uses OpenAI-compatible client | ChatGPT OAuth 5-hour + weekly adapter; API usage when available |
| GitHub Copilot | OAuth, token/JSON import | Copilot-specific token exchange/request adapter | Adapter when endpoint is available; otherwise unavailable state |
| Cursor | OAuth, token/JSON import, local import | Cursor adapter or compatible endpoint | Provider-specific adapter or unavailable |
| Windsurf | OAuth, token/JSON import, local import | Windsurf adapter | Provider-specific adapter or unavailable |
| Kiro | OAuth, token/JSON import, local import | Kiro adapter | Provider-specific adapter or unavailable |
| Grok CLI / xAI | OAuth, API key, OpenAI-compatible base URL, local import | xAI/OpenAI-compatible adapter | xAI usage endpoint when available |
| CodeBuddy / CodeBuddy CN | OAuth, token/JSON import, local import | Regional/provider adapter | Adapter or unavailable |
| Qoder | Local import, JSON import | Qoder adapter | Adapter or unavailable |
| Trae family | Local import, credential injection/import | Regional adapter | Adapter or unavailable |
| Zed | OAuth, JSON import, local current-login import | Zed adapter | Adapter or unavailable |
| ZCode | OAuth, encrypted local credential import/export | Z.ai/BigModel adapter | Adapter or unavailable |

A provider is considered “supported” only when its declared connection method can produce a usable in-app model client. A catalog entry without an implemented adapter remains hidden from the Add provider list until its capability status is `ready`.

## 5. Account and secret model

Extend the existing safe metadata without exposing secrets:

- `ProviderAccount`: `id`, `providerId`, `label`, `authMode`, `status`, `profile`, `createdAt`, `lastUsedAt`, `oauthExpiresAt`, `keyRef`, `capabilities`, `usage`.
- `ProviderSecret` is main-process-only and contains provider-specific token/key fields. It is stored under a Vault key referenced by `keyRef`.
- `ProviderAccount.status` remains `active | disabled | expired | error`.
- `activeAccountId` is retained for backwards compatibility, but Agent assignments are allowed to target any enabled account.
- Removing an account deletes its Vault secret, cached models and usage snapshot after confirmation.

Migration must preserve existing OpenAI OAuth accounts and API-key providers. Existing `ProviderSettings` entries become account-backed records; no plaintext key is written during migration. If migration cannot move a legacy key into Vault, the account is marked `error` with an actionable message and the key is not displayed.

## 6. Authentication flows

The Add provider button opens a split menu:

1. Select provider family from searchable supported adapters.
2. Select one of that adapter's declared methods.
3. Render method-specific form or browser/import action.
4. Complete connection in main process.
5. Validate credentials, discover profile/models, persist account and emit account-changed event.

OAuth uses a per-login session with PKCE/state and a provider-specific callback/exchange implementation. Multiple concurrent logins are supported with unique login ids. Browser-open failure leaves the modal with a copyable authorization URL.

API key flow accepts key and optional base URL only when declared by the adapter. Local/import flow accepts a file path or pasted JSON in the renderer, passes it once to main, validates schema, stores normalized secret and clears the input state.

Refresh occurs before a request when the access token is expired or within the adapter refresh threshold. Refresh failure sets `error` or `expired`, emits an account event and returns a recoverable error to the Agent.

## 7. Model and Agent integration

`AgentModelAssignment` remains the single source of truth and gains strict account validation:

```ts
{ provider: string; accountId?: string; model: string; speed?: 'standard' | 'fast'; fallback?: ... }
```

The model picker receives only models from active accounts. Generic model names are filtered where the adapter marks the account as code-only (especially ChatGPT OAuth). Agents can be assigned to different accounts of the same provider.

On send, `ProviderRuntime` resolves the assignment, verifies account status, refreshes credentials if required, selects the adapter model and creates the existing `LlmClient`. The Agent loop remains unaware of OAuth/API/import details. A disabled or expired account produces a Vietnamese `[bs]` error with a Settings action hint; fallback is attempted only for assignments explicitly configured by the user.

## 8. Quota and usage

`ProviderUsage` remains the normalized UI contract. Adapter usage responses map into:

- plan/account identity and subscription expiry;
- primary (5-hour or provider-equivalent) remaining percentage and reset time;
- secondary (weekly or provider-equivalent) remaining percentage and reset time;
- requests, token input, token output and estimated billed amount since the latest reset;
- provider/source/status and a precise unavailable reason.

No adapter may infer a quota limit from request failures. If usage is unsupported, return `status: 'unavailable'` and retain account/model data. Cached usage is displayed with its refresh age and can be manually refreshed.

The Providers tab renders one full-width vertical `QuotaAccountCard` per account. The card includes the account identity, plan/expiry, active models, two-button Standard/Fast switch, Active/Inactive status and action button, quota progress bars, reset countdowns and usage metrics. The current status badge and action label are separate: `Active` + `Deactivate`, `Inactive` + `Activate`.

## 9. IPC contract

Add centralized channels and preload methods for capability-driven flows:

- `provider:capabilities` — list ready adapters and auth methods;
- `provider:connect-start` / `provider:connect-submit` — begin and complete OAuth/API/import flow;
- `provider:connect-cancel` — cancel pending auth session;
- `provider:models` / `provider:fetch-models` — list cached or refreshed account models;
- existing account enable/disable/remove/switch channels remain and become adapter-agnostic;
- `provider:usage-refresh` remains account-scoped;
- `provider:accounts-changed` and `provider:usage` events remain the renderer update mechanism.

IPC payloads contain safe metadata only. File import APIs accept a path or one-time payload and never return the raw credential.

## 10. UI behavior

Settings → Providers shows only connected accounts. The Add provider split button exposes provider and method menus; unsupported combinations are not shown. The modal supports back navigation, loading states, browser-open status, import validation, retry and cancel.

Each account card is full width in a vertical list. The card must remain readable at the existing settings panel width, reserve space for loading/error states and provide keyboard focus states. Standard/Fast are two direct buttons with `aria-pressed`; speed selection is persisted in the relevant Agent assignment or account default according to the existing Agent model.

Agent settings list active accounts grouped by provider, then models. Chat selects an Agent, not a raw generic provider model. The quota card in the right panel continues to show only accounts/models used by the current session.

## 11. Error handling and security

- Never log secret payloads, authorization codes or imported JSON.
- Validate provider id, method and input in main process even if renderer validation passed.
- Redact provider errors before surfacing them to renderer when they contain tokens or headers.
- OAuth state mismatch, callback timeout, refresh failure, invalid import and unsupported model are distinct error codes with user-safe messages.
- Account disable is reversible; account removal requires confirmation and securely removes the Vault entry.
- Adapters must use HTTPS endpoints unless a user explicitly supplies an OpenAI-compatible local/base URL; local URLs are labeled clearly in UI.

## 12. Testing requirements

Unit tests:

- adapter registry capability filtering;
- OAuth state/PKCE session lifecycle;
- API/import input validation and secret redaction;
- account migration and Vault reference handling;
- model filtering and account assignment validation;
- usage normalization, remaining-percent calculations and unavailable states.

Integration tests:

- connect API provider → account card → model list → Agent assignment → request client;
- complete OAuth callback → account appears without deleting another provider;
- disable/activate account updates Agent model choices;
- refresh quota updates both Providers card and right-panel card;
- expired token refresh and recoverable failure.

E2E smoke:

- open Providers tab, open Add provider, choose provider/method, cancel and retry;
- connect a test API adapter using a fixture secret;
- verify vertical card content and Active/Deactivate, Inactive/Activate labels;
- select Agent and confirm only active account models are available.

## 13. Delivery phases

1. Contracts, registry, account migration, generic modal IPC and UI shell.
2. Harden OpenAI/ChatGPT OAuth + API key, including existing quota card and code-model filtering.
3. GitHub Copilot OAuth/import and compatible model runtime.
4. Cursor, Windsurf, Kiro and Grok adapters.
5. CodeBuddy, Qoder, Trae, Zed and ZCode adapters.
6. Provider-specific quota adapters, documentation and full test matrix.

Each phase must pass `npm run typecheck` and `npm test`; E2E is required for phases that change provider/chat UI or authentication flows.

