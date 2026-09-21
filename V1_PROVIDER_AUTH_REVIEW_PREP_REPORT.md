# BS Coding V1 Provider Authentication Architecture Review Preparation Report

**Date**: 2026-09-21  
**Executor**: BS Coding Agent  
**Repository**: `https://github.com/tuannm711/BS-Coding.git`  
**Target Branch**: `develop/v1`  
**Fix Branch**: `fix/v1-provider-auth`  

---

## A. Git State

- **Repository**: `https://github.com/tuannm711/BS-Coding.git`
- **Current Branch**: `fix/v1-provider-auth`
- **Full Local HEAD SHA**: `e0e208a32bae8f1ba6158090b6bcc31cc0086720` (prior to corrective commit)
- **V1 Baseline SHA (`develop/v1`)**: `2f16deb968f24201fa2b5899f6f0f553361c202a`
- **Working Tree State**: Fix and corrective tasks applied cleanly; ready for review commit.

---

## B. Branch Isolation

- **Merge Base with `develop/v1`**: `2f16deb968f24201fa2b5899f6f0f553361c202a`
- **Merge Base with `develop/v2`**: `31f865340a6c3fc85cdc3925b09705b300d60f6e`
- **Merge Base with `main`**: `31f865340a6c3fc85cdc3925b09705b300d60f6e`
- **Merge Base with `release/v1`**: `75a2a98655e5a8e66b0510a1628e03120cbc6122`
- **Confirmation**: Zero commits or files from `develop/v2`, `main`, or `release/v1` were modified. Work is strictly confined to `fix/v1-provider-auth`.

---

## C. Corrective Architecture Improvements

1. **Managed Authorization Strategy**:
   - Resolved OAuth routing bypass in `ProviderManager.createAuthorization()`.
   - Introduced `ProviderManagedAuthorizationStrategy` so that managed providers (such as OpenAI via Codex App Server) route directly to their own lifecycle coordinator rather than triggering legacy PKCE callback servers.
2. **Standard Codex App Server Handshake**:
   - Implemented JSON-RPC notification `initialized` immediately following the `initialize` response, adhering strictly to the Codex protocol specification (`codex-cli 0.155.0`).
3. **Long-Running Process Lifetime & Clean Teardown**:
   - Eliminated premature client termination in `finally` blocks during login.
   - Client process remains alive throughout the authorization session, receives `account/login/completed`, queries `account/read`, saves the account with `status: 'active'`, and cleans up cleanly using `tree-kill`.
4. **ChatGPT Device Code Flow**:
   - Added support for `chatgpt-device-code` via `account/login/start` with `{ type: 'chatgptDeviceCode' }`.
   - UI (`AddProviderModal.tsx`) renders the verification URL and user code with convenient one-click copy actions.
5. **Scope Reduction for Google**:
   - Disabled/removed incomplete `vertex-ai` authentication to prevent user confusion.
   - Retained only official Google AI Studio Gemini API Key authentication.
6. **Configurable Codex Binary**:
   - Added `codexPath` to `BsSettings` and `BsConfig`, allowing users with non-standard PATH installations to customize the executable location.
7. **Managed Authorization Two-Phase Activation**:
   - Introduced `activate?: () => void` to `ProviderManagedAuthorizationStartResult` and `ProviderManager.createAuthorization()`.
   - Event listeners for `account/login/completed` are attached before starting login to prevent any window where notifications could be dropped.
   - Completions arriving before session registration are buffered and atomically flushed on `activate()`.
   - Idempotent: duplicate notifications, cancelled sessions, and expired sessions emit only one single terminal state.
8. **Codex Account Directory Containment Hardening**:
   - Set trusted root strictly to `<userDataDir>/providers/openai`.
   - Enforced strict validation against `account.id` path traversal (forbidding `/`, `\`, `..`, and absolute paths).
   - Ensured `targetHome` is contained strictly within `<userDataDir>/providers/openai/<account.id>` and never resolves to user home or `~/.codex`.
   - Refuses any deletion or native action if any check fails.
9. **Safe Native Logout & Isolated Directory Removal**:
   - `CodexAppServerClient.logout()` starts the client if not already running and awaits native `account/logout`.
   - Caught and logged safely if the native client is unavailable or returns an error, without failing the account removal operation.
   - `client.stop()` cleanly terminates the process tree via `tree-kill` and awaits process exit to release file locks.
   - Directory deletion is backed by `safeRemoveDirectory` retry helper to handle transient Windows filesystem lock delays (`EPERM`, `EBUSY`, `ENOTEMPTY`).

---

## D. Codex App Server Capability Matrix

| Capability | Implemented | Tested | Real-Provider Tested | Notes |
| ---------- | ----------: | -----: | -------------------: | ----- |
| app-server spawn | **YES** | **YES** | **YES** | Spawns `codex` (`codex.cmd` on Win) with `--listen stdio://` |
| `CODEX_HOME` isolation | **YES** | **YES** | **YES** | `CODEX_HOME` set per account in `<userData>/providers/openai/<id>/codex-home` |
| `initialize` request | **YES** | **YES** | **YES** | Handshake request sent on startup |
| `initialized` notification | **YES** | **YES** | **YES** | Notification sent immediately after `initialize` response |
| `account/read` | **YES** | **YES** | **YES** | Queries account profile & auth state (unauthenticated verified live) |
| `account/login/start` | **YES** | **YES** | **YES** | Starts device code session (`chatgptDeviceCode`) verified against live CLI |
| browser login | **YES** | **YES** | **NO (Pending Interactive Auth)** | App opens `authUrl` in browser via `openAuthorization()` |
| device-code login | **YES** | **YES** | **NO (Pending Interactive Auth)** | Exposes `verificationUrl` and `userCode`; token capture pending live user auth |
| login completion event | **YES** | **YES** | **NO (Unit/Mock Tested)** | Handled via `account/login/completed` JSON-RPC notifications |
| account logout | **YES** | **YES** | **NO (Unit/Mock Tested)** | `account/logout` method implemented in client |
| account updated notification | **YES** | **YES** | **NO (Unit/Mock Tested)** | Received over JSON-RPC stdio notification stream |
| rate limits | **YES** | **YES** | **NO (Unit/Mock Tested)** | `account/rateLimits/read` mapped into `ProviderUsage` with allSettled resilience |
| usage | **YES** | **YES** | **NO (Unit/Mock Tested)** | Turn completed usage token counts & lifetime tokens extracted |
| thread creation | **YES** | **YES** | **NO (Unit/Mock Tested)** | `thread/start` called before turn with model, baseInstructions, and cwd |
| turn creation | **YES** | **YES** | **NO (Unit/Mock Tested)** | `turn/start` called for streaming prompts |
| text streaming | **YES** | **YES** | **NO (Unit/Mock Tested)** | `item/agentMessage/delta` mapped to `LlmStreamPart` |
| reasoning streaming | **YES** | **YES** | **NO (Unit/Mock Tested)** | Reasoning deltas mapped to `kind: 'reasoning'` |
| tools capability | **DISABLED**| **YES** | **N/A (Disabled: false)** | Catalog explicitly specifies `supportsTools: false` |
| finish | **YES** | **YES** | **NO (Unit/Mock Tested)** | `turn/completed` mapped to finish event with token breakdown |
| errors | **YES** | **YES** | **NO (Unit/Mock Tested)** | `error` / `turn/error` mapped to error stream events |
| cancellation / `account/login/cancel` | **YES** | **YES** | **YES** | `account/login/cancel` tested against live CLI |
| cancellation / `turn/interrupt` | **YES** | **YES** | **NO (Unit/Mock Tested)** | `turn/interrupt` called on `AbortSignal` abort with listener cleanup |
| process restart | **YES** | **YES** | **NO (Unit/Mock Tested)** | Child process exit handler cleans state & allows restart |
| crash handling | **YES** | **YES** | **NO (Unit/Mock Tested)** | Process crash rejects pending RPC requests |
| timeouts | **YES** | **YES** | **NO (Unit/Mock Tested)** | 30s timeout per RPC request |
| clean shutdown | **YES** | **YES** | **YES** | `client.stop()` terminates full process tree via `tree-kill` |

---

## E. Google Provider Reality Check

### Gemini Developer API
- **Status**: **FULLY IMPLEMENTED & TESTED**
- **Authentication**: Official Gemini Developer API Key (`AIzaSy...`) from Google AI Studio.
- **Client**: Official `@ai-sdk/google` (`createGoogleGenerativeAI({ apiKey })`).
- **Required Fields**: `apiKey`.
- **Supported Models**: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-3.1-pro`, `gemini-3.1-flash`.
- **Model Discovery**: Dynamically queries Google AI Studio API for available models, filtering out embeddings, image generation, and deprecated models, with static catalog fallback.
- **Legacy 1.5 Models**: All `gemini-1.5-*` models completely removed.
- **Vertex AI Status**: Incomplete experimental Vertex code disabled/removed to keep V1 surface secure and strictly compliant.

---

## F. AccountStatus Audit

- **Definition**: `AccountStatus = 'active' | 'disabled' | 'expired' | 'error'`.
- **Finding**: All provider adapters save active accounts as `'active'` (never `'connected'`).
- **Consumer Alignment**: `BsAgentManager`, `ProviderManager`, and UI filters query `account.status === 'active'`.

---

## G. Automated Test Results

- **`npm run typecheck`**: **PASSED** (0 errors across `tsconfig.node.json`, `tsconfig.web.json`, `tsconfig.extension.json`, `tsconfig.test.json`, and `server/tsconfig.json`).
- **`npm test`**: **161 / 161 test files PASSED (1225 / 1225 tests PASSED, 0 failed)**.
- **`npm run build`**: **PASSED** (Main, Preload, Renderer, Extension all built successfully).
- **`npm run e2e`**: **PASSED** (Provider capability modal and account connection verified in Electron browser UI at `tests/e2e/smoke.spec.ts:152`).

---

## H. Multi-Account & Filesystem Isolation Proof

1. **Installed BS Coding v1.3.2 Production Application**:
   - The installed BS Coding v1.3.2 binary and its data in `%APPDATA%\BS Coding` were **NOT modified, overwritten, or accessed**.
2. **Real BS User Data (`userData`)**:
   - Tests run exclusively in temp directories via `mkdtempSync` and isolated `userDataDir`.
3. **Global `%USERPROFILE%\.codex` Configuration**:
   - Global `~/.codex` was **NEVER written or modified**. Verified by automated smoke test `tests/integration/isolated-smoke.test.ts`.
4. **Other Branches (`develop/v2`, `main`, `release/v1`)**:
   - Zero commits or files from other branches touched.
