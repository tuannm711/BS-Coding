# Provider Authorization Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral, user-controlled authorization-link flow for OpenAI/ChatGPT, Antigravity IDE and GitHub Copilot, then fix Settings > Agents so create/delete immediately updates the active workspace Agent list.

**Architecture:** OAuth details live in each `ProviderAdapter.authorization` strategy while `ProviderManager` owns PKCE, callback listeners, session state and persistence. Typed IPC exposes only public session state; the renderer creates a link and waits until the user explicitly copies or opens it. After OAuth verification is complete, a separate workspace reconciliation path makes saved Agent profiles the canonical source for active native Agents.

**Tech Stack:** Electron 41 main/preload IPC, React 19, TypeScript strict, Node `http`/`crypto`, Vitest, Playwright.

**Approved spec:** `docs/superpowers/specs/2026-08-23-provider-authorization-link-design.md`

**Cockpit reference:** `crates/cockpit-core/src/modules/github_copilot_oauth.rs` in `jlcodes99/cockpit-tools`; copy the protocol behavior, not the Rust structure or unrelated account-manager features.

---

## File and responsibility map

| File | Responsibility after this plan |
|---|---|
| `src/shared/providers.ts` | Public authorization request/session/status/error contracts. |
| `src/shared/ipc.ts` | Authorization and workspace-runtime channels plus `AgentApi` methods. |
| `src/main/providers/types.ts` | Adapter-owned authorization strategy contract. |
| `src/main/providers/registry.ts` | Reject visible OAuth methods without a real authorization strategy. |
| `src/main/providers/auth/session.ts` | Secret-bearing, memory-only authorization session state machine. |
| `src/main/connections/oauth.ts` | Loopback listener with configurable port/path, denial/timeout classification and idempotent cleanup. |
| `src/main/connections/manager.ts` | Provider-neutral create/get/open/cancel/completion orchestration. |
| `src/main/providers/auth/github-copilot-oauth.ts` | GitHub PKCE URL, code exchange, profile and Copilot entitlement/token calls. |
| `src/main/providers/adapters/openai.ts` | ChatGPT authorization strategy and Codex auth-file post-persist hook. |
| `src/main/providers/adapters/antigravity.ts` | Google authorization strategy and Antigravity profile/token normalization. |
| `src/main/providers/adapters/github-copilot.ts` | GitHub strategy, Copilot credential refresh and runtime secrets. |
| `src/main/index.ts` | Adapter construction, IPC handlers, emitted authorization/workspace events. |
| `src/preload/index.ts` | Narrow renderer bridge for typed authorization/workspace events. |
| `src/renderer/src/components/settings/AddProviderModal.tsx` | OAuth modal state reducer and Create/Copy/Open/Cancel UI. |
| `src/renderer/src/App.tsx` | Consume canonical workspace-runtime changes. |
| `src/main/agent/workspace-reconcile.ts` | Pure desired-vs-current native Agent reconciliation. |
| `src/renderer/src/styles.css` | Authorization link/status/countdown layout. |

## Task 1: Define public and adapter authorization contracts

**Files:**
- Modify: `src/shared/providers.ts`
- Modify: `src/main/providers/types.ts`
- Modify: `src/main/connections/types.ts`
- Test: `tests/unit/provider-authorization-contract.test.ts`

- [ ] **Step 1: Write the failing public-contract test**

Create `tests/unit/provider-authorization-contract.test.ts` with a compile/runtime assertion that public state contains only safe fields:

```ts
import { describe, expect, it } from 'vitest'
import type { ProviderAuthorizationSession } from '../../src/shared/providers'

describe('provider authorization contract', () => {
  it('exposes public session metadata without OAuth secrets', () => {
    const session: ProviderAuthorizationSession = {
      loginId: 'login-1', providerId: 'openai', methodId: 'oauth',
      authUrl: 'https://auth.example/authorize', expiresAt: 123,
      status: 'waiting'
    }
    expect(Object.keys(session).sort()).toEqual([
      'authUrl', 'expiresAt', 'loginId', 'methodId', 'providerId', 'status'
    ])
    expect(session).not.toHaveProperty('verifier')
    expect(session).not.toHaveProperty('accessToken')
  })
})
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `npx vitest run tests/unit/provider-authorization-contract.test.ts`

Expected: FAIL because `ProviderAuthorizationSession` is not exported.

- [ ] **Step 3: Add the exact public types**

Add to `src/shared/providers.ts`:

```ts
export type ProviderAuthorizationStatus = 'waiting' | 'connected' | 'expired' | 'cancelled' | 'error'

export type ProviderAuthorizationErrorKind =
  | 'callback-port-unavailable'
  | 'authorization-expired'
  | 'authorization-cancelled'
  | 'authorization-denied'
  | 'oauth-state-mismatch'
  | 'token-exchange-failed'
  | 'profile-fetch-failed'
  | 'entitlement-missing'
  | 'provider-oauth-unavailable'
  | 'browser-open-failed'

export interface ProviderAuthorizationError {
  kind: ProviderAuthorizationErrorKind
  message: string
}

export interface ProviderAuthorizationRequest {
  providerId: string
  methodId: string
  reconnectAccountId?: string
}

export interface ProviderAuthorizationSession {
  loginId: string
  providerId: string
  methodId: string
  authUrl: string
  expiresAt: number
  status: ProviderAuthorizationStatus
  accountId?: string
  error?: ProviderAuthorizationError
}
```

Add `githubAccessToken?: string` to `ProviderSecrets` in `src/main/connections/types.ts` so the GitHub identity token is separate from the short-lived Copilot runtime token.

Add these complete adapter contracts to `src/main/providers/types.ts`:

```ts
export interface ProviderAuthorizationBuildInput {
  pkce: { verifier: string; challenge: string; state: string }
  callbackUrl: string
}

export interface ProviderAuthorizationBuildResult {
  authUrl: string
  expectedState: string
}

export interface ProviderAuthorizationCompleteInput {
  code: string
  verifier: string
  callbackUrl: string
  reconnectAccount?: ProviderAccount
}

export interface ProviderAuthorizationCompleteResult {
  account: Omit<ProviderAccount, 'id' | 'createdAt' | 'lastUsedAt'>
  secrets: ProviderSecrets
}

export interface ProviderAuthorizationStrategy {
  methodId: string
  callback: { port: number; path: string; timeoutMs: number }
  build(input: ProviderAuthorizationBuildInput): ProviderAuthorizationBuildResult
  complete(input: ProviderAuthorizationCompleteInput): Promise<ProviderAuthorizationCompleteResult>
  afterPersist?(account: ProviderAccount, secrets: ProviderSecrets): Promise<void> | void
}
```

Add `authorization?: ProviderAuthorizationStrategy` to `ProviderAdapter`.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/provider-authorization-contract.test.ts tests/unit/provider-adapter-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit only contract files**

```bash
git add src/shared/providers.ts src/main/providers/types.ts src/main/connections/types.ts tests/unit/provider-authorization-contract.test.ts
git commit -m "feat: define provider authorization contracts"
```

## Task 2: Build the memory-only session and loopback callback engine

**Files:**
- Modify: `src/main/providers/auth/session.ts`
- Modify: `src/main/connections/oauth.ts`
- Test: `tests/unit/provider-auth-session.test.ts`
- Test: `tests/unit/connections-oauth.test.ts`

- [ ] **Step 1: Replace the existing coordinator test with RED state-machine cases**

Cover isolation, terminal transitions, expiry and secret redaction:

```ts
it('isolates provider sessions and exposes only public state', () => {
  const sessions = new AuthSessionCoordinator(() => 1_000)
  const first = sessions.start({ providerId: 'openai', methodId: 'oauth', authUrl: 'https://a', expiresAt: 2_000, verifier: 'v1', expectedState: 's1', callbackUrl: 'http://localhost/a', close: vi.fn() })
  const second = sessions.start({ providerId: 'antigravity', methodId: 'oauth', authUrl: 'https://b', expiresAt: 2_000, verifier: 'v2', expectedState: 's2', callbackUrl: 'http://localhost/b', close: vi.fn() })
  expect(first.loginId).not.toBe(second.loginId)
  expect(sessions.public(first.loginId)).not.toHaveProperty('verifier')
  expect(sessions.pending(first.loginId)?.verifier).toBe('v1')
})

it('closes once and rejects late completion after cancellation', () => {
  const close = vi.fn()
  const sessions = new AuthSessionCoordinator(() => 1_000)
  const session = sessions.start({ providerId: 'openai', methodId: 'oauth', authUrl: 'https://a', expiresAt: 2_000, verifier: 'v', expectedState: 's', callbackUrl: 'http://localhost/a', close })
  expect(sessions.cancel(session.loginId)?.status).toBe('cancelled')
  expect(sessions.complete(session.loginId, 'account-1')).toBeUndefined()
  expect(close).toHaveBeenCalledTimes(1)
})
```

Add callback tests for a denied callback, state preservation and dynamic port allocation:

```ts
it('reports OAuth denial without exposing the query body', async () => {
  const callback = await listenForCallback({ port: 0, path: '/callback', timeoutMs: 1_000 })
  get(`${callback.callbackUrl}?error=access_denied&error_description=No`).on('error', () => {})
  await expect(callback.result).rejects.toMatchObject({ kind: 'authorization-denied' })
})
```

- [ ] **Step 2: Run both test files and confirm RED**

Run: `npx vitest run tests/unit/provider-auth-session.test.ts tests/unit/connections-oauth.test.ts`

Expected: FAIL because the coordinator and listener do not implement the new API.

- [ ] **Step 3: Implement the coordinator**

`AuthSessionCoordinator` stores an internal record containing `verifier`, `expectedState`, `callbackUrl` and `close`, while `public(loginId)` returns a newly constructed `ProviderAuthorizationSession`. Implement `complete`, `fail`, `cancel`, `expire` and `closeAll` as idempotent terminal transitions. `pending(loginId)` must return `undefined` after expiry or any terminal transition.

Use this transition helper rather than deleting terminal public state immediately:

```ts
private finish(loginId: string, status: Exclude<ProviderAuthorizationStatus, 'waiting'>, patch: Partial<ProviderAuthorizationSession> = {}) {
  const record = this.sessions.get(loginId)
  if (!record || record.public.status !== 'waiting') return undefined
  record.close()
  record.public = { ...record.public, ...patch, status }
  record.verifier = ''
  record.expectedState = ''
  return { ...record.public }
}
```

- [ ] **Step 4: Implement the async callback listener**

Change `listenForCallback` to accept `{ port, path, timeoutMs }`, await the server `listening` event, bind only `127.0.0.1`, expose the resolved `callbackUrl`, and reject with a typed `{ kind, message }` error. Preserve literal plus characters through `URLSearchParams`; do not log the query. Make `close()` idempotent.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/provider-auth-session.test.ts tests/unit/connections-oauth.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the engine**

```bash
git add src/main/providers/auth/session.ts src/main/connections/oauth.ts tests/unit/provider-auth-session.test.ts tests/unit/connections-oauth.test.ts
git commit -m "feat: add provider authorization session engine"
```

## Task 3: Add provider-neutral authorization orchestration to ProviderManager

**Files:**
- Modify: `src/main/connections/manager.ts`
- Test: `tests/unit/connections-manager.test.ts`

- [ ] **Step 1: Write a RED test with an in-memory OAuth adapter**

The adapter strategy returns an account and model without provider-name branching:

```ts
it('creates a link without opening it and completes through the adapter strategy', async () => {
  const opened: string[] = []
  const changes: ProviderAuthorizationSession[] = []
  const adapter = oauthFixtureAdapter({ callbackPort: 0, model: 'fixture-code' })
  const registry = new ProviderRegistry()
  registry.register(adapter)
  const manager = new ProviderManager({
    accountsFile: testAccountsFile('generic-auth'), registry, vault: fakeVault() as never,
    openExternal: url => { opened.push(url) },
    onAuthorizationChanged: session => changes.push(session)
  })

  const session = await manager.createAuthorization({ providerId: 'oauth-fixture', methodId: 'oauth' })
  expect(session.status).toBe('waiting')
  expect(opened).toEqual([])
  await manager.openAuthorization(session.loginId)
  expect(opened).toEqual([session.authUrl])
  await sendFixtureCallback(session.authUrl)
  await vi.waitFor(() => expect(manager.getAuthorization(session.loginId)?.status).toBe('connected'))
  expect(manager.list('oauth-fixture')[0].accounts[0].models).toEqual(['fixture-code'])
  expect(changes.at(-1)?.status).toBe('connected')
})
```

Add negative tests for invalid method, reconnect to another provider, state mismatch, expiry, cancellation and browser-open failure.

- [ ] **Step 2: Run the manager test and confirm RED**

Run: `npx vitest run tests/unit/connections-manager.test.ts -t "creates a link"`

Expected: FAIL because `createAuthorization`, `getAuthorization` and `openAuthorization` do not exist.

- [ ] **Step 3: Implement generic manager methods**

Add `onAuthorizationChanged?: (session: ProviderAuthorizationSession) => void` to `ProviderManagerDeps`, then implement:

```ts
async createAuthorization(request: ProviderAuthorizationRequest): Promise<ProviderAuthorizationSession>
getAuthorization(loginId: string): ProviderAuthorizationSession | undefined
async openAuthorization(loginId: string): Promise<void>
cancelAuthorization(loginId: string): ProviderAuthorizationSession | undefined
```

Creation must resolve `registry.resolveRequest`, require `method.kind === 'oauth'` and `adapter.authorization?.methodId === request.methodId`, create PKCE, await the callback listener, call `strategy.build`, then store the session. It must not call `openExternal`.

The callback promise validates `result.state === pending.expectedState`, delegates to `strategy.complete`, writes through `ProviderAccountStore`, calls `adapter.listModels`, persists the model catalog, runs `afterPersist`, emits account/snapshot changes, then marks the authorization session `connected` with `accountId`.

Errors are converted through one `authorizationError(error)` classifier and pushed as terminal public state. Raw response bodies and query values are excluded.

- [ ] **Step 4: Keep compatibility wrappers without automatic opening**

Implement `startLogin(providerId, reconnectAccountId?)` so adapters already carrying an authorization strategy delegate to `createAuthorization({ providerId, methodId: 'oauth', reconnectAccountId })`. Retain the existing OpenAI and Antigravity completion branches temporarily so this task remains green before Tasks 4 and 5 migrate those adapters, but remove their automatic `openExternal` calls now. Implement `cancelLogin` through `cancelAuthorization` for generic sessions and the legacy pending map for the two not-yet-migrated sessions.

- [ ] **Step 5: Run manager and existing provider tests**

Run: `npx vitest run tests/unit/connections-manager.test.ts tests/unit/provider-auth-session.test.ts tests/integration/provider-agent-chat.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit orchestration**

```bash
git add src/main/connections/manager.ts tests/unit/connections-manager.test.ts
git commit -m "feat: orchestrate provider authorization sessions"
```

## Task 4: Move OpenAI authorization into its adapter

**Files:**
- Modify: `src/main/providers/adapters/openai.ts`
- Modify: `src/main/connections/codex.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/provider-openai-authorization.test.ts`

- [ ] **Step 1: Write RED adapter tests**

Test URL construction, normalized account output and auth-file post-persist behavior with a temporary directory:

```ts
it('builds and completes ChatGPT authorization in the adapter', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    access_token: 'access', refresh_token: 'refresh', id_token: jwt({ email: 'plus@example.com' }), expires_in: 3600
  }), { status: 200 })))
  const adapter = createOpenAiAdapter()
  const built = adapter.authorization!.build({ pkce: pkceFixture, callbackUrl: 'http://127.0.0.1:1455/auth/callback' })
  expect(new URL(built.authUrl).searchParams.get('state')).toBe(pkceFixture.state)
  const result = await adapter.authorization!.complete({ code: 'code', verifier: pkceFixture.verifier, callbackUrl: 'http://127.0.0.1:1455/auth/callback' })
  expect(result.account).toMatchObject({ providerId: 'openai', label: 'plus@example.com', authMode: 'oauth' })
  expect(result.secrets).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
})
```

- [ ] **Step 2: Run the new test and confirm RED**

Run: `npx vitest run tests/unit/provider-openai-authorization.test.ts`

Expected: FAIL because the OpenAI adapter has no authorization strategy.

- [ ] **Step 3: Implement the OpenAI strategy**

Change `createOpenAiAdapter` to accept optional `{ codexAuthFile?: string; codexBackupFile?: string }`. The strategy uses port `1455`, path `/auth/callback`, timeout `300_000`, `codexAuthorizeUrl`, `exchangeCodexCode` and `decodeJwtProfile`. `afterPersist` calls `mergeCodexAuthFile` only when a file path was supplied.

Keep OAuth account metadata exactly:

```ts
{
  providerId: 'openai',
  label: profile.email ?? `ChatGPT account ${new Date().toLocaleString()}`,
  authMode: 'oauth', status: 'active',
  profile: { email: profile.email, name: profile.name },
  oauthExpiresAt: tokens.expiresAt
}
```

- [ ] **Step 4: Route OpenAI through the generic manager**

Remove the OpenAI-specific branch and token/profile imports from `ProviderManager`. Construct the adapter in `MainApp` with the existing auth-file paths. `connectMethod` routes an OAuth method to `createAuthorization` when its adapter has a strategy; the temporary Antigravity legacy branch remains until Task 5. Non-OAuth methods still call `adapter.connect`.

- [ ] **Step 5: Run OpenAI and manager coverage**

Run: `npx vitest run tests/unit/provider-openai-authorization.test.ts tests/unit/provider-adapter-contract.test.ts tests/unit/connections-manager.test.ts && npm run typecheck`

Expected: PASS and the manager source contains no `decodeJwtProfile`, `exchangeCodexCode` or `mergeCodexAuthFile` import.

- [ ] **Step 6: Commit OpenAI migration**

```bash
git add src/main/providers/adapters/openai.ts src/main/connections/codex.ts src/main/connections/manager.ts src/main/index.ts tests/unit/provider-openai-authorization.test.ts
git commit -m "refactor: move ChatGPT authorization into adapter"
```

## Task 5: Move Antigravity authorization into its adapter

**Files:**
- Modify: `src/main/providers/adapters/antigravity.ts`
- Modify: `src/main/providers/auth/antigravity-oauth.ts`
- Modify: `src/main/connections/manager.ts`
- Test: `tests/unit/provider-antigravity.test.ts`
- Test: `tests/integration/provider-agent-chat.test.ts`

- [ ] **Step 1: Add a RED adapter completion test**

```ts
it('normalizes an Antigravity OAuth account through its adapter strategy', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/token')
    ? new Response(JSON.stringify({ access_token: 'ya29', refresh_token: 'refresh', expires_in: 3600 }), { status: 200 })
    : new Response(JSON.stringify({ email: 'pro@example.com', name: 'Pro User' }), { status: 200 })))
  const adapter = createAntigravityAdapter()
  const result = await adapter.authorization!.complete({ code: 'code', verifier: 'verifier', callbackUrl: 'http://127.0.0.1:1457/auth/callback' })
  expect(result.account).toMatchObject({ providerId: 'antigravity', label: 'pro@example.com', authMode: 'oauth' })
  expect(result.secrets).toMatchObject({ accessToken: 'ya29', refreshToken: 'refresh' })
})
```

- [ ] **Step 2: Run and confirm RED**

Run: `npx vitest run tests/unit/provider-antigravity.test.ts -t "normalizes an Antigravity"`

Expected: FAIL because `authorization` is undefined.

- [ ] **Step 3: Implement the Antigravity strategy**

Use port `1457`, path `/auth/callback`, timeout `300_000`, `antigravityAuthorizeUrl`, `exchangeAntigravityCode` and `fetchAntigravityProfile`. Return normalized account metadata and tokens; let the generic manager run `listModels` so `projectId`, tier and remote model catalog are persisted before `connected`.

- [ ] **Step 4: Remove the final Antigravity manager branch**

Delete `startAntigravityLogin` and its imports from `ProviderManager`. Assert in `tests/unit/provider-adapter-contract.test.ts` that manager source does not contain provider comparisons for `'openai'` or `'antigravity'`.

- [ ] **Step 5: Update the integration test to use explicit link opening semantics**

Change the Antigravity integration flow to call `createAuthorization`, then send the callback directly based on the returned URL/state. Assert `openExternal` remains uncalled during creation.

- [ ] **Step 6: Run focused and integration tests**

Run: `npx vitest run tests/unit/provider-antigravity.test.ts tests/unit/provider-adapter-contract.test.ts tests/integration/provider-agent-chat.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit Antigravity migration**

```bash
git add src/main/providers/adapters/antigravity.ts src/main/providers/auth/antigravity-oauth.ts src/main/connections/manager.ts tests/unit/provider-antigravity.test.ts tests/unit/provider-adapter-contract.test.ts tests/integration/provider-agent-chat.test.ts
git commit -m "refactor: move Antigravity authorization into adapter"
```

## Task 6: Implement GitHub Copilot authorization and enforce registry parity

**Files:**
- Create: `src/main/providers/auth/github-copilot-oauth.ts`
- Modify: `src/main/providers/adapters/github-copilot.ts`
- Modify: `src/main/providers/registry.ts`
- Test: `tests/unit/provider-github-copilot.test.ts`
- Test: `tests/unit/providers-registry.test.ts`
- Test: `tests/integration/provider-github-copilot.test.ts`

- [ ] **Step 1: Write RED URL and token tests using sanitized fixtures**

```ts
it('builds the VS Code Copilot authorization URL with PKCE and callback state', () => {
  const callbackUrl = 'http://127.0.0.1:61280/callback?nonce=nonce-value'
  const url = githubCopilotAuthorizeUrl({ challenge: 'challenge-value' }, callbackUrl)
  const parsed = new URL(url)
  expect(parsed.origin + parsed.pathname).toBe('https://github.com/login/oauth/authorize')
  expect(parsed.searchParams.get('redirect_uri')).toBe('https://vscode.dev/redirect')
  expect(parsed.searchParams.get('state')).toBe(callbackUrl)
  expect(parsed.searchParams.get('prompt')).toBe('select_account')
  expect(parsed.searchParams.get('get_started_with')).toBe('copilot-vscode')
})
```

Mock these calls in order: `POST https://github.com/login/oauth/access_token`, `GET https://api.github.com/user`, optional `GET https://api.github.com/user/emails`, `GET https://api.github.com/copilot_internal/v2/token`, `GET https://api.github.com/copilot_internal/user`. Assert GitHub identity requests use `Bearer`, Copilot internal requests use `token`, and a missing Copilot token throws an `entitlement-missing` error without returning an account.

- [ ] **Step 2: Run GitHub tests and confirm RED**

Run: `npx vitest run tests/unit/provider-github-copilot.test.ts`

Expected: FAIL because the helper and strategy are absent.

- [ ] **Step 3: Implement the GitHub helper**

Use these Cockpit-compatible protocol constants: client ID `01ab8ac9400c4e429b23`, native-client exchange secret `2af589bb2ffd03a29cc0df83f767e3f6693f14cd`, authorize endpoint `https://github.com/login/oauth/authorize`, token endpoint `https://github.com/login/oauth/access_token`, user endpoint `https://api.github.com/user`, email endpoint `https://api.github.com/user/emails`, Copilot token endpoint `https://api.github.com/copilot_internal/v2/token`, Copilot user endpoint `https://api.github.com/copilot_internal/user`, redirect `https://vscode.dev/redirect`, scope `read:user repo user:email workflow`, `get_started_with=copilot-vscode`, API version `2025-04-01` and user agent `bs-coding`. Keep response bodies out of thrown messages; include only status and operation.

Return secrets as:

```ts
{
  githubAccessToken,
  accessToken: copilot.token,
  expiresAt: copilot.expiresAt ? copilot.expiresAt * 1000 : undefined,
  planName: copilot.plan
}
```

- [ ] **Step 4: Implement the adapter strategy and refresh**

Use dynamic callback port `0`, path `/callback`, timeout `300_000`. Build `callbackUrl` with `nonce=<pkce.state>`, return it as `expectedState`, and let GitHub redirect through `vscode.dev`. Normalize profile label from email, then login, and set plan metadata. `refreshCredentials` exchanges `githubAccessToken` for a fresh Copilot token when `expiresAt` is within 60 seconds.

- [ ] **Step 5: Enforce visible OAuth parity in the registry**

Add to `ProviderRegistry.register`:

```ts
const oauthMethods = adapter.capability.methods.filter(method => method.kind === 'oauth')
if (oauthMethods.length > 0 && (!adapter.authorization || !oauthMethods.some(method => method.id === adapter.authorization!.methodId))) {
  throw new Error(`[bs] Provider ${adapter.capability.id} exposes OAuth without an authorization strategy`)
}
```

Add a registry test using a deliberately invalid adapter and assert all three production OAuth adapters register successfully.

- [ ] **Step 6: Add a full mocked GitHub integration flow**

Verify `create link -> callback -> GitHub token/profile -> Copilot entitlement -> account -> models -> connected`, plus the negative no-entitlement path and reconnect preserving account ID.

- [ ] **Step 7: Run GitHub, registry and contract tests**

Run: `npx vitest run tests/unit/provider-github-copilot.test.ts tests/unit/providers-registry.test.ts tests/unit/provider-adapter-contract.test.ts tests/integration/provider-github-copilot.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit GitHub support**

```bash
git add src/main/providers/auth/github-copilot-oauth.ts src/main/providers/adapters/github-copilot.ts src/main/providers/registry.ts tests/unit/provider-github-copilot.test.ts tests/unit/providers-registry.test.ts tests/integration/provider-github-copilot.test.ts
git commit -m "feat: add GitHub Copilot authorization link"
```

## Task 7: Wire typed authorization IPC and preload APIs

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/connections/manager.ts`
- Test: `tests/unit/ipc-provider-state.test.ts`
- Test: `tests/unit/ipc-contract.test.ts`

- [ ] **Step 1: Write RED channel/wiring assertions**

Extend the provider IPC test with:

```ts
const methods: Array<keyof AgentApi> = [
  'createProviderAuthorization', 'getProviderAuthorization',
  'openProviderAuthorization', 'cancelProviderAuthorization',
  'onProviderAuthorizationChanged'
]
expect(Channels.ProviderAuthorizationCreate).toBe('provider:authorization-create')
expect(Channels.ProviderAuthorizationGet).toBe('provider:authorization-get')
expect(Channels.ProviderAuthorizationOpen).toBe('provider:authorization-open')
expect(Channels.ProviderAuthorizationCancel).toBe('provider:authorization-cancel')
expect(Channels.EventProviderAuthorizationChanged).toBe('provider:authorization-changed')
```

- [ ] **Step 2: Run IPC tests and confirm RED**

Run: `npx vitest run tests/unit/ipc-provider-state.test.ts tests/unit/ipc-contract.test.ts`

Expected: FAIL because the channels/API methods are missing.

- [ ] **Step 3: Add channels, `AgentApi` methods and preload bridge**

Use only `Channels` constants. `openProviderAuthorization` accepts `loginId`, never a renderer-provided URL. The event callback receives `ProviderAuthorizationSession`.

- [ ] **Step 4: Register main handlers and events**

Wire create/get/open/cancel to `ProviderManager`. Set `onAuthorizationChanged` in `MainApp` dependencies to send `Channels.EventProviderAuthorizationChanged`.

- [ ] **Step 5: Remove the now-unused legacy login contract**

The current source search shows no renderer consumer of `startProviderLogin` or `cancelProviderLogin`. Remove `ProviderLoginStart`, `ProviderLoginCancel`, the two `AgentApi` methods, preload bindings, main handlers and `ProviderManager.startLogin/cancelLogin`. Keep `connectProviderMethod` for API-key/import methods; OAuth UI uses only the new authorization methods.

- [ ] **Step 6: Run IPC tests and typecheck**

Run: `npx vitest run tests/unit/ipc-provider-state.test.ts tests/unit/ipc-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit IPC wiring**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/index.ts src/main/connections/manager.ts tests/unit/ipc-provider-state.test.ts tests/unit/ipc-contract.test.ts
git commit -m "feat: expose provider authorization IPC"
```

## Task 8: Redesign the provider modal around explicit link actions

**Files:**
- Modify: `src/renderer/src/components/settings/AddProviderModal.tsx`
- Modify: `src/renderer/src/components/settings/Modal.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/unit/provider-authorization-view.test.ts`

- [ ] **Step 1: Write RED tests for a pure modal reducer/view model**

Export `authorizationView` and `reduceAuthorizationState` from the modal module, then test:

```ts
it('shows create only for OAuth and waiting actions only after creation', () => {
  expect(authorizationView({ methodKind: 'api-key', session: null, now: 1_000 })).toMatchObject({ showCreate: false })
  expect(authorizationView({ methodKind: 'oauth', session: null, now: 1_000 })).toMatchObject({ showCreate: true, showWaitingActions: false })
  expect(authorizationView({ methodKind: 'oauth', session: waitingSession, now: 1_000 })).toMatchObject({ showCreate: false, showWaitingActions: true, secondsLeft: 60 })
})

it('ignores events for another login id', () => {
  expect(reduceAuthorizationState(waitingSession, { ...waitingSession, loginId: 'other', status: 'connected' })).toBe(waitingSession)
})
```

- [ ] **Step 2: Run the view test and confirm RED**

Run: `npx vitest run tests/unit/provider-authorization-view.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 3: Implement modal state and lifecycle**

For OAuth methods, replace generic Continue with **Create authorization link**. Creation calls `createProviderAuthorization` and keeps the modal open. Subscribe once to `onProviderAuthorizationChanged`; accept only the current `loginId`. A one-second interval updates the countdown from `expiresAt` and is cleared on state change/unmount.

Extend `Modal` with `showDefaultActions?: boolean` (default `true`) and wrap its existing footer in that condition. `AddProviderModal` sets it to `false` while an authorization session is visible so the custom buttons do not duplicate the generic Cancel/Submit footer.

The waiting UI contains:

```tsx
<input className="input authorization-url" aria-label="Authorization link" readOnly value={session.authUrl} />
<div className="authorization-actions">
  <button className="btn" onClick={() => void navigator.clipboard.writeText(session.authUrl)}>Copy link</button>
  <button className="btn primary" onClick={() => void window.api.openProviderAuthorization(session.loginId)}>Open browser</button>
  <button className="btn danger" onClick={() => void cancelAuthorization()}>Cancel</button>
</div>
```

Closing the modal calls cancel before `onClose` only when status is `waiting`. API-key/import submission continues to use `connectProviderMethod` and closes on success. `connected` renders the success state, calls `onConnected`, then closes after a single 600 ms notification timer that is cleared on unmount; session creation, account refresh and Agent synchronization never depend on that timer.

- [ ] **Step 4: Render classified terminal states**

Show **Generate new link** for `expired`, retry for retryable `error`, and safe error text from the public session. Remove the incorrect “A browser window will open” hint.

- [ ] **Step 5: Add compact responsive styles**

Add grid/flex rules for `.authorization-session`, `.authorization-url`, `.authorization-actions`, `.authorization-countdown` and terminal status. At narrow modal width, buttons wrap without hiding the URL or error. Reuse existing color tokens and button classes.

- [ ] **Step 6: Run renderer helper tests and typecheck**

Run: `npx vitest run tests/unit/provider-authorization-view.test.ts tests/unit/provider-dashboard.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the modal**

```bash
git add src/renderer/src/components/settings/AddProviderModal.tsx src/renderer/src/components/settings/Modal.tsx src/renderer/src/styles.css tests/unit/provider-authorization-view.test.ts
git commit -m "feat: add explicit provider authorization link UI"
```

## Task 9: Add cross-provider integration, E2E and manual verification evidence

**Files:**
- Create: `tests/integration/provider-authorization-flows.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Create: `docs/evidence/2026-08-23-provider-authorization-link-verification.md`

- [ ] **Step 1: Add a parameterized integration test**

For OpenAI and Antigravity, mock token/profile/model endpoints and assert each follows:

```ts
const session = await manager.createAuthorization({ providerId, methodId: 'oauth' })
expect(openExternal).not.toHaveBeenCalled()
await issueProviderCallback(session)
await waitForAuthorization(manager, session.loginId, 'connected')
expect(manager.list(providerId)[0].accounts[0]).toMatchObject({ authMode: 'oauth', status: 'active' })
```

Include GitHub Copilot with its full endpoint chain. Assert every connected account receives a non-empty model catalog and no token exists in `ProviderAuthorizationSession` JSON.

- [ ] **Step 2: Run integration tests and confirm they pass**

Run: `npx vitest run tests/integration/provider-authorization-flows.test.ts`

Expected: PASS for all three providers.

- [ ] **Step 3: Add an Electron E2E modal test**

Open Settings > Providers, choose OpenAI OAuth, click **Create authorization link**, assert the modal remains visible with Authorization link, Copy/Open/Cancel and a countdown. Assert API-key selection has none of those actions. Click Cancel and assert the listener is released by successfully generating a second OpenAI link in the same app run.

- [ ] **Step 4: Build and run E2E**

Run: `npm run build && npm run e2e`

Expected: all Playwright tests pass, including the new authorization modal test.

- [ ] **Step 5: Record manual verification checklist**

Write the evidence file with app version/commit, date, provider/account type, Create/Copy/Open/callback/account/models result for OpenAI, Antigravity and GitHub Copilot. Mark a provider `Not run — credentials unavailable` rather than claiming success when a live account is unavailable.

- [ ] **Step 6: Commit verification coverage**

```bash
git add tests/integration/provider-authorization-flows.test.ts tests/e2e/smoke.spec.ts docs/evidence/2026-08-23-provider-authorization-link-verification.md
git commit -m "test: verify provider authorization links"
```

## Task 10: Fix Settings Agent create/delete synchronization

**Files:**
- Create: `src/main/agent/workspace-reconcile.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/unit/workspace-agent-reconcile.test.ts`
- Test: `tests/unit/ipc-contract.test.ts`
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Write the RED pure reconciliation test**

```ts
it('adds missing profiles and removes obsolete native agents without touching PTY agents', () => {
  const current = [
    { id: 'bs-id', name: 'bs', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const },
    { id: 'old-id', name: 'old', templateId: 'bs', cwd: 'C:/repo', kind: 'native' as const },
    { id: 'pty-id', name: 'shell', templateId: 'opencode', cwd: 'C:/repo', kind: 'pty' as const }
  ]
  expect(planNativeAgentReconciliation(current, ['bs', 'reviewer'])).toEqual({
    add: ['reviewer'], remove: ['old-id']
  })
})
```

Add cases preserving `bs`, rejecting duplicate profile names and choosing `bs` as the selected fallback when the current Agent is removed.

- [ ] **Step 2: Run the reconciliation test and confirm RED**

Run: `npx vitest run tests/unit/workspace-agent-reconcile.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure diff**

`planNativeAgentReconciliation(current, desiredNames)` returns deterministic `add` names and `remove` IDs. It compares only `kind === 'native'`, always retains `bs`, preserves existing IDs for unchanged names and never mutates the input arrays.

- [ ] **Step 4: Reconcile the active workspace after settings save**

Add `MainApp.saveSettings(settings)` that first calls `bsAgent.saveSettings`, then reconciles the active workspace:

- add each missing profile through `WorkspaceStore.addAgent` using `{ name, templateId: 'bs', cwd: projectPath, kind: 'native' }`, register it with `bsAgent.addAgent`, and initialize idle state;
- remove each obsolete native Agent through one shared cleanup method that calls `bsAgent.removeAgent`, stops PTY/process state defensively, updates `WorkspaceStore`, clears alerts/state/logs and buffers;
- build one fresh `WorkspaceRuntime`, emit `EventWorkspaceRuntimeChanged`, refresh workspace summaries, and return the saved settings.

Do not reconcile when no workspace is active. Do not remove PTY agents.

- [ ] **Step 5: Add the workspace runtime event contract**

Add `EventWorkspaceRuntimeChanged: 'workspace:runtime-changed'`, `onWorkspaceRuntimeChanged(cb)` to `AgentApi`, preload subscription and IPC contract test coverage. Payload is the complete `WorkspaceRuntime`, not a partial Agent array.

- [ ] **Step 6: Consume canonical runtime in App**

Subscribe in `App` and replace runtime only when `next.workspace.projectPath` matches the active project. Refresh workspace summaries, backgrounds and buffer ownership from the event. When the currently visible Agent disappears, React derives panes and chat selection from the new runtime; the `bs` Agent is the deterministic fallback.

Keep `SettingsDialog` on the existing `saveSettings` call. Do not make the renderer call `addAgent`/`removeAgent` to mirror main state; the main-process save handler emits the canonical runtime event.

- [ ] **Step 7: Write the RED-then-GREEN Electron E2E flow**

Start with only `bs`. In Settings > Agents add `reviewer`, Save, and assert a second native pane/right-panel Agent appears without restarting. Reopen Settings, remove `reviewer`, Save, and assert it disappears while `bs` remains selectable and chat-enabled. Check the user-data workspace file contains only `bs` after deletion.

Run before production changes to capture RED, then after Steps 3–6:

Run: `npm run build && npx playwright test tests/e2e/smoke.spec.ts -g "settings agent list"`

Expected after implementation: PASS.

- [ ] **Step 8: Run focused regression and typecheck**

Run: `npx vitest run tests/unit/workspace-agent-reconcile.test.ts tests/unit/workspace-store.test.ts tests/unit/ipc-contract.test.ts tests/unit/bs-agent-manager.test.ts && npm run typecheck`

Expected: PASS and no orphan Agent runner remains after deletion.

- [ ] **Step 9: Commit Agent synchronization separately**

```bash
git add src/main/agent/workspace-reconcile.ts src/main/index.ts src/shared/ipc.ts src/preload/index.ts src/renderer/src/App.tsx tests/unit/workspace-agent-reconcile.test.ts tests/unit/ipc-contract.test.ts tests/e2e/smoke.spec.ts
git commit -m "fix: synchronize settings agents with workspace"
```

## Task 11: Full verification, security audit and changelog

**Files:**
- Modify: `docs/changelog-0.25.7.md`
- Modify: `docs/evidence/2026-08-23-provider-authorization-link-verification.md`

- [ ] **Step 1: Search for forbidden provider branches and secret leaks**

Run:

```bash
rg -n "providerId === '(openai|antigravity|github-copilot)'|openExternal\?\.\(authUrl\)" src/main/connections/manager.ts
rg -n "verifier|accessToken|refreshToken|githubAccessToken" src/preload src/renderer
```

Expected: no provider-specific manager branch, no secret-bearing renderer/preload contract; safe type imports are acceptable only when they do not serialize secrets.

- [ ] **Step 2: Run mandatory static and unit/integration gates**

Run: `npm run typecheck && npm test`

Expected: all typecheck projects and all Vitest files pass.

- [ ] **Step 3: Run build and complete E2E suite**

Run: `npm run build && npm run e2e`

Expected: build succeeds and all Playwright tests pass.

- [ ] **Step 4: Check patch hygiene**

Run: `git diff --check && git status --short`

Expected: no whitespace errors. Review every remaining modified/untracked path and preserve unrelated user changes.

- [ ] **Step 5: Update changelog and evidence truthfully**

Using `docs/changelog-format.md`, record the authorization-link flow, GitHub Copilot OAuth, explicit browser action, session security and Agent list synchronization. Update live verification rows only with observed results; automated fixture success is labeled automated.

- [ ] **Step 6: Run final documentation check and commit**

Run: `git diff --check -- docs/changelog-0.25.7.md docs/evidence/2026-08-23-provider-authorization-link-verification.md`

Then:

```bash
git add docs/changelog-0.25.7.md docs/evidence/2026-08-23-provider-authorization-link-verification.md
git commit -m "docs: record authorization link verification"
```

## Completion gates

- All visible OAuth methods have a registered strategy.
- Creating a link never opens a browser.
- Copy/Open/Cancel/expiry/retry are available in the modal.
- OpenAI, Antigravity and GitHub Copilot pass mocked full-flow integration coverage.
- No OAuth secrets cross renderer IPC.
- Live-account results are not claimed until manually observed.
- Settings Agent create/delete updates the active workspace immediately and leaves no orphan process.
- `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` and `git diff --check` pass on the final tree.
