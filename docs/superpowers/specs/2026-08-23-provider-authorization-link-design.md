# Provider Authorization Link Design

Date: 2026-08-23

## 1. Goal

Add a provider-neutral authorization-link flow to BS Coding. Every OAuth method that is visible in
the provider connection modal must be able to create a real, time-limited authorization session.
Creating a session only displays the link; BS Coding must not open the browser until the user clicks
**Open browser**.

The first delivery covers the OAuth providers currently declared in BS Coding:

- OpenAI / ChatGPT.
- Antigravity IDE.
- GitHub Copilot.

API-key and credential-import methods are unchanged and do not display authorization-link actions.
Future OAuth providers inherit the same manager, IPC, renderer and test flow by implementing the
adapter authorization contract.

## 2. Current Problem

The shared IPC result already contains `authUrl`, but OAuth orchestration is split across hard-coded
branches in `ProviderManager`. OpenAI and Antigravity immediately call `shell.openExternal`, while
GitHub Copilot advertises OAuth in its capability descriptor but throws an unsupported-session error.
The modal closes immediately after requesting a login, so it cannot present the link, session status,
expiry, cancellation or recovery actions.

This creates three contract violations:

1. A visible OAuth method does not guarantee a working authorization handler.
2. The renderer cannot control when the browser opens.
3. Adding an OAuth provider requires provider-specific changes outside its adapter.

## 3. Approved Product Behavior

### 3.1 Method availability

- Show **Create authorization link** only when the selected method is `kind: 'oauth'` and the
  provider adapter supplies an authorization handler.
- Do not show a disabled authorization button for API-key or import-only providers.
- Do not publish an OAuth method in a provider definition unless its handler passes the adapter
  contract tests.

### 3.2 Modal states

The provider connection modal has the following OAuth states:

1. `idle`: provider and OAuth method selected; show **Create authorization link**.
2. `creating`: disable duplicate submission while the main process creates the session.
3. `waiting`: show a read-only authorization URL, countdown, **Copy link**, **Open browser** and
   **Cancel**.
4. `connected`: show a short success state after the callback creates and refreshes the account.
5. `expired`: preserve the explanation and show **Generate new link**.
6. `error`: show a safe classified error and allow retry when appropriate.

Creating the authorization link must never open a browser. **Open browser** is the only action that
invokes `shell.openExternal`. **Copy link** uses the renderer clipboard API and does not mutate the
authorization session.

Closing the modal while a session is pending cancels it. Cancellation closes any local callback
listener and removes PKCE verifier, state and pending completion data from memory.

### 3.3 Completion

- Local callback providers complete automatically when the matching callback arrives.
- The main process validates provider, login ID, callback state and expiry before exchanging a code.
- Successful token exchange creates or reconnects the intended account, refreshes its profile and
  model catalog, emits a new provider snapshot and reports the session as `connected`.
- The modal observes session status through typed IPC. It must not infer success by polling the
  provider account list.
- A reconnect session retains the original account ID and creation metadata.

## 4. Architecture

### 4.1 Adapter-owned authorization

Extend `ProviderAdapter` with an optional authorization strategy. The strategy owns all
provider-specific details:

- authorization endpoint, client identity, scopes and provider parameters;
- callback mode and redirect URI;
- authorization URL construction;
- authorization-code exchange;
- profile resolution and normalized account creation;
- provider-specific token fields and initial model discovery.

The adapter receives common PKCE/state material from the session manager. Provider-specific secrets
remain in the main process and vault.

An adapter that declares an OAuth method must implement the strategy. Registry validation rejects a
definition that exposes OAuth without it. This prevents the current GitHub Copilot mismatch from
returning.

### 4.2 Provider-neutral session manager

`ProviderManager` owns a map of pending authorization sessions keyed by `loginId`. Each entry stores:

- `providerId` and `methodId`;
- optional `reconnectAccountId`;
- PKCE verifier and state;
- creation and expiry timestamps;
- session status and a safe error value;
- callback listener cleanup;
- one completion promise.

The manager delegates URL construction and completion to the selected adapter. It contains no
OpenAI, Google or GitHub provider branches. Session transitions are one-way:

`creating -> waiting -> connected | expired | cancelled | error`.

Completion and cancellation are idempotent. Late callbacks after cancellation or expiry cannot
exchange tokens or create accounts.

### 4.3 Shared contracts and IPC

Replace the login-start-only renderer contract with typed authorization operations:

- `createProviderAuthorization(request)` returns public session data including `loginId`, `authUrl`,
  `expiresAt` and `status`.
- `getProviderAuthorization(loginId)` returns the latest public status without secrets.
- `openProviderAuthorization(loginId)` validates the pending session and opens its stored URL.
- `cancelProviderAuthorization(loginId)` cancels and cleans up the session.
- `onProviderAuthorizationChanged` pushes terminal and error transitions to the modal.

Public session data never includes authorization codes, access tokens, refresh tokens, ID tokens,
PKCE verifier or OAuth client secrets. IPC channels are added only through `Channels` in
`src/shared/ipc.ts`; renderer code continues to use `window.api` through the preload bridge.

The existing `startProviderLogin` API is retained temporarily as a main/preload compatibility wrapper
only if tests show an internal consumer still requires it. New renderer code uses the typed
authorization operations. The compatibility wrapper must also avoid automatically opening a browser.

### 4.4 Browser opening

`ProviderManager` receives an `openExternal` dependency but calls it only from the explicit
`openProviderAuthorization` operation. The manager validates that the session exists, is still
pending and that the URL exactly matches the stored authorization URL before opening it.

## 5. Provider Implementations

### 5.1 OpenAI / ChatGPT

Preserve the current Codex PKCE and loopback callback behavior, token exchange, JWT profile parsing,
multi-account reconnect semantics and optional Codex auth-file merge. Remove the automatic browser
open from session creation.

### 5.2 Antigravity IDE

Preserve Google OAuth scopes, offline refresh-token request, loopback callback, profile lookup and
Cloud Code model hydration. Remove the automatic browser open from session creation.

### 5.3 GitHub Copilot

Implement the Cockpit-style GitHub authorization flow behind the same adapter contract:

- use PKCE S256 and a unique state/nonce for every session;
- build the GitHub authorization URL with the Copilot client parameters and account-selection prompt;
- receive the redirected authorization code through the supported callback path;
- exchange the code for a GitHub token, resolve the GitHub profile and Copilot entitlement/token;
- persist only normalized secrets in the vault;
- hydrate the account's code-model catalog before reporting `connected`.

GitHub endpoint errors or a missing Copilot entitlement leave no partially active account. The
adapter remains `experimental` until its fixture tests and an explicit live login verification pass.

The implementation is informed by Cockpit's provider-specific OAuth modules, but BS Coding keeps its
own provider-neutral session contract and uses the credentials only inside BS Coding.

## 6. Error Handling

Public errors use stable kinds and safe English UI messages while main-process system errors retain
the `[bs]` prefix:

- `callback-port-unavailable`;
- `authorization-expired`;
- `authorization-cancelled`;
- `authorization-denied`;
- `oauth-state-mismatch`;
- `token-exchange-failed`;
- `profile-fetch-failed`;
- `entitlement-missing`;
- `provider-oauth-unavailable`;
- `browser-open-failed`.

Raw upstream bodies, tokens, authorization codes and verifier values are not included in renderer
errors or logs. A failed completion always closes its callback listener and produces a terminal
session state. Retrying creates a new `loginId`, verifier, state and URL.

## 7. Security Constraints

- Only the main process listens for OAuth callbacks and exchanges authorization codes.
- Callback listeners bind to `127.0.0.1` only.
- State and PKCE are unique per session, memory-only and removed on every terminal transition.
- Redirect/callback input is parsed as a URL and validated against the pending provider session.
- Renderer IPC receives only public session metadata.
- OAuth tokens are written through the existing vault and are never copied to settings JSON.
- Browser opening accepts a `loginId`, not an arbitrary renderer-provided URL.
- Concurrent sessions are isolated; completing one session cannot resolve another provider's login.

## 8. Testing and Acceptance

Implementation follows red-green-refactor for each behavior.

### 8.1 Contract and unit tests

- Registry rejects every visible OAuth method without an authorization strategy.
- Creating a session returns a URL and does not call `openExternal`.
- Explicit open calls `openExternal` once with the stored URL.
- Copying a URL does not change session status.
- Expiry, cancellation, invalid state, duplicate callbacks and late callbacks are deterministic.
- Renderer-facing session snapshots contain no secrets.
- OpenAI, Antigravity and GitHub URL builders and completion parsers have sanitized fixtures.

### 8.2 Integration tests

Each of the three providers must pass a mocked flow:

`create link -> waiting -> callback -> token/profile -> account -> models -> connected`.

Reconnect tests prove the account ID is preserved. Negative GitHub tests prove that missing Copilot
entitlement does not create an active account.

### 8.3 Renderer and end-to-end tests

- OAuth selection renders **Create authorization link**.
- API-key/import selection does not render the button.
- The modal remains open and renders Copy/Open/Cancel after link creation.
- Link creation never opens the browser; clicking **Open browser** does.
- Connected, expired and classified error states render correctly.
- Closing the waiting modal invokes cancellation.

Before completion, run `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e` and
`git diff --check`. A real-account login must be manually verified for OpenAI, Antigravity and GitHub
Copilot before claiming live OAuth parity.

## 9. Follow-up Task: Agent List Refresh

After all authorization-link implementation and verification tasks pass, investigate and fix the
Settings > Agents synchronization defect:

- Creating an Agent in Settings > Agents must add it to the Agent list outside the chat area without
  closing or restarting the app.
- Deleting an Agent in Settings > Agents must remove it from that list immediately.
- The chat Agent picker and the external Agent list must consume the same canonical workspace state.
- Duplicate local renderer state must not be refreshed by arbitrary delays.
- Add a failing renderer or integration test that reproduces both create and delete paths before
  changing production code.
- Verify selection fallback when the currently selected Agent is deleted and ensure no active native
  Agent process is orphaned.

This is a separate final plan task. It must not be mixed into OAuth session changes or used to delay
the authorization-link acceptance gates.

## 10. Out of Scope

- Implementing OAuth/runtime support for every provider available in Cockpit.
- Adding authorization UI to API-key or import-only providers.
- Automatically opening a browser when a link is generated.
- Persisting pending authorization sessions across app restarts.
- Exporting OAuth credentials for use outside BS Coding.
- Refactoring unrelated provider quota or Agent assignment behavior.

