# Cockpit-style Provider Architecture

## Status

Approved design; implementation audited on 2026-08-23. See `docs/superpowers/audits/2026-08-23-cockpit-provider-implementation-audit.md` and the enforced v2 plan.

## Goal

Make provider connections, agent assignments, runtime transport, model discovery and quota usage behave as one coherent system for BS Coding. The design must support multiple accounts per provider, account activation/deactivation, provider-specific OAuth/API methods, provider-specific model catalogs, and live quota cards without stale assignments.

The initial priority is Antigravity OAuth, ChatGPT OAuth and OpenAI API. Other providers must fit the same contracts without adding provider-specific branches to agent or renderer code.

## Problems addressed

- Agent settings can display the first model after reopening because Settings, workspace agent state and `bs.json` are not treated as one assignment source.
- Quota cards can retain a previous model because they fetch assignments only when the agent list changes.
- Antigravity OAuth tokens were previously routed through the OpenAI-compatible client.
- Model discovery is partly static and partly account-derived, with no explicit freshness or source metadata.
- Quota adapters are optional but their unavailable state is not differentiated from zero quota or exhausted quota.
- A provider connection currently mixes authentication, account persistence, model discovery, runtime transport and usage fetching.

## Design principles

1. Account identity is separate from provider identity. A provider may have many accounts; an account has one provider.
2. An agent assignment is explicit: `providerId`, `accountId`, `modelId`, and `speed`. No layer silently substitutes a different model except an explicit unavailable-account fallback event.
3. Provider-specific behavior lives behind provider contracts. Renderer and agent manager never inspect OAuth provider names to decide transport.
4. Every mutation emits a versioned snapshot event. Chat, Settings and quota cards consume the same snapshot and refresh atomically.
5. Secrets remain main-process-only. Renderer receives masked identity and capability data only.
6. A provider can report `unavailable`, `exhausted`, `cooldown`, or `ready`; these states are not represented as a generic missing API key.

## Domain model

```ts
interface ProviderDefinition {
  id: string
  displayName: string
  methods: ProviderAuthMethod[]
  capabilities: {
    modelDiscovery: 'static' | 'account' | 'remote'
    runtime: 'oauth' | 'api-key' | 'openai-compatible' | 'custom'
    usage: 'supported' | 'unavailable'
  }
}

interface ProviderAccount {
  id: string
  providerId: string
  label: string
  authMode: 'oauth' | 'api-key' | 'imported'
  status: 'active' | 'disabled' | 'error'
  profile?: { email?: string; name?: string; plan?: string }
  models: ProviderModelRef[]
  usage?: ProviderUsageSnapshot
  keyRef?: string
  lastError?: ProviderError
  updatedAt: number
}

interface AgentAssignment {
  agentId: string
  providerId: string
  accountId?: string
  modelId: string
  speed: 'standard' | 'fast'
  revision: number
}
```

`models` stores metadata, not only strings. Each model has `id`, display name, code/tool/streaming capabilities, and discovery timestamp. The selected `modelId` is persisted exactly and is never replaced with `models[0]` during Settings hydration.

## Provider contracts

Each registered provider implements:

```ts
interface ProviderAdapter {
  definition(): ProviderDefinition
  connect(methodId: string, fields: Record<string, string>): Promise<ProviderAccount>
  refreshAccount(account: ProviderAccount): Promise<ProviderAccount>
  listModels(account: ProviderAccount): Promise<ProviderModelRef[]>
  createRuntime(account: ProviderAccount, model: ProviderModelRef): ProviderRuntime
  fetchUsage?(account: ProviderAccount): Promise<ProviderUsageSnapshot>
}

interface ProviderRuntime {
  stream(request: ProviderRuntimeRequest, signal?: AbortSignal): AsyncGenerator<ProviderRuntimeEvent>
}
```

Antigravity's adapter owns Google OAuth refresh, Cloud Code `v1internal` transport, Gemini-style request conversion, tool schema sanitization, SSE parsing and Cloud Code error classification. OpenAI's adapter owns Codex OAuth headers and OpenAI API-key transport. No generic `createLlm(provider, token)` fallback is allowed for OAuth providers.

## State and persistence

`accounts.json` remains the account index and Vault remains the secret store. Add a small `assignments.json` (or an equivalent versioned section in workspace state) as the canonical agent assignment store. Workspace agent records may cache the assignment for rendering, but the assignment service is authoritative.

On Settings save:

1. Validate provider, account and model compatibility.
2. Persist the assignment with a new revision.
3. Update the workspace agent cache.
4. Rebuild the native runtime for that agent.
5. Emit `AgentAssignmentChanged` with the full assignment snapshot.

On app/workspace open, assignments are loaded first, account models are refreshed second, and agents are registered third. If a selected account is disabled or deleted, the assignment becomes `error` and the UI requires an explicit account choice; it does not silently select the first model.

## IPC snapshots and events

Add centralized channels:

- `ProviderSnapshotGet`: definitions, connected accounts, model metadata and usage snapshots.
- `ProviderConnectMethod`: starts OAuth/API/import connection and returns a login handle when needed.
- `ProviderAccountRefresh`: refreshes token, profile, models and usage for one account.
- `AgentAssignmentGet` / `AgentAssignmentSet`.
- `AgentAssignmentChanged`: emitted after every assignment mutation.
- `ProviderSnapshotChanged`: emitted after account/model/usage changes.

The snapshot includes a monotonically increasing `revision`. Renderer components discard older revisions. `RightPanelQuota` renders only the current snapshot and assignment map; it does not maintain a separate model cache.

## Provider Settings UX

The Providers tab becomes an account dashboard:

- Show connected accounts grouped by provider, one vertical card per account.
- Show provider name, account identity, auth method, plan, active/disabled/error state, model chips, usage status and last refresh.
- The primary `Add provider` button opens a method picker: provider → OAuth/API/import → connection modal.
- Account actions are `Activate`, `Deactivate`, `Refresh`, `Reconnect`, and `Remove`.
- `Refresh` reports model/usage stages independently so a quota adapter being unavailable does not hide a successful login/model refresh.
- Unavailable usage is labeled `Usage unavailable`; exhausted quota is labeled `Quota exhausted` and includes reset/cooldown data when available.

## Agent Settings UX

Each agent row has four explicit fields:

1. Provider
2. Account (only accounts belonging to the selected provider)
3. Model (only models belonging to the selected account/provider)
4. Speed

Changing provider resets account and model only after confirmation when the current assignment is incompatible. Reopening Settings reads the persisted assignment snapshot and selects the exact saved model. The UI shows a validation state when a saved model is no longer offered, instead of silently selecting the first model.

## Chat and quota UX

The chat panel subscribes to `AgentAssignmentChanged` and `ProviderSnapshotChanged`. The quota card groups agents by account but lists every model used by that account in the current session. A model change updates the card immediately and persists across reopening Settings and restarting the workspace.

For HTTP 429/`RESOURCE_EXHAUSTED`:

- Record provider error classification and retry-after/reset timestamp.
- Display `Quota exhausted` or `Model capacity exhausted`, depending on the error details.
- Disable automatic retry until the retry window expires unless the user selects a fallback model.
- Keep the card's usage values distinct from unavailable usage.

## Migration

1. Read existing `bs.json` agent provider/model/account fields into assignment records.
2. Convert account model string arrays to model references with default capabilities.
3. Preserve existing account IDs and Vault references.
4. Mark assignments whose account/model cannot be matched as `needs-review`; never replace them silently.
5. Keep a backup of migrated settings and write a migration version.

## Testing and acceptance

Unit tests must cover:

- Settings save → reopen preserves the exact provider/account/model/speed.
- Invalid account does not silently change the model.
- Provider model refresh updates account catalog and emits a snapshot revision.
- Quota card updates after `AgentAssignmentChanged`.
- Antigravity OAuth uses Cloud Code transport and never OpenAI transport.
- Cloud Code tool schemas contain no unsupported JSON Schema keywords.
- 429 exhausted and 503 capacity errors map to distinct UI states.

Integration tests must cover a full OAuth account → assignment → workspace open → chat request path with mocked provider endpoints. Existing provider and chat tests must remain green.

## Phased delivery

### Phase 1 — Canonical assignment and snapshot contracts

Introduce assignment persistence, snapshot IPC, migration and exact Settings hydration. Fix quota card subscription to consume assignment events.

### Phase 2 — Provider adapter boundary

Move OpenAI and Antigravity runtime/model/usage logic behind adapter contracts. Remove generic OAuth fallback branches from `BsAgentManager`.

### Phase 3 — Cockpit-style provider dashboard

Replace Providers tab with grouped account cards, connection method picker, staged refresh, and account lifecycle actions.

### Phase 4 — Quota and resilience

Implement Antigravity usage refresh, error classification, reset/cooldown handling, model fallback selection and live card updates.

### Phase 5 — Remaining providers

Port each provider to the same adapter contracts, with provider-specific tests and connection methods.

## Non-goals

- Exposing provider secrets to the renderer.
- Automatically bypassing provider quota or account restrictions.
- Supporting arbitrary external model endpoints through the Antigravity OAuth adapter.
- Replacing the existing workspace/project model.

## Completion integrity rules

- A green legacy test suite is regression evidence only; it is not feature acceptance.
- Every phase must add and pass new tests for its own acceptance criteria before being marked complete.
- UI requirements require running-app evidence, not only TypeScript/build success.
- A task must report changed files, test names/output, and known gaps at its checkpoint.
- Any silent fallback to the first model, missing migration evidence, or missing provider-specific runtime test blocks completion.
