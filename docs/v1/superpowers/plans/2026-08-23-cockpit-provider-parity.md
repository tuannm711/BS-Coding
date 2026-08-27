# Cockpit Provider Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the remaining Cockpit-supported provider accounts into BS Coding so each provider can authenticate/import credentials, refresh tokens where required, discover usable coding models, send requests inside BS Coding, and expose provider-specific quota data.

**Architecture:** Extend the existing `ProviderAdapter` registry with provider-specific auth, model, runtime and usage modules. Reuse common account/Vault/IPC/UI infrastructure, but never pretend an OpenAI-compatible endpoint is a provider-specific implementation when Cockpit uses a distinct protocol. Each adapter is marked `ready` only after auth, request, model and quota tests pass; otherwise it remains `experimental` and is hidden from the default Add provider list.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vault, centralized IPC, existing `LlmClient`, Vitest, Playwright.

**Reference baseline:** Cockpit Tools README currently lists Antigravity IDE, Codex, GitHub Copilot, Windsurf, Kiro, Cursor, Grok CLI, CodeBuddy, CodeBuddy CN, Qoder, Trae family, Zed and ZCode, and describes provider-specific auth/quota behavior: [README](https://github.com/jlcodes99/cockpit-tools/blob/main/README.md).

---

## Scope boundary

Included in BS Coding:

- credential acquisition/import and refresh;
- account profile, plan and Active/Inactive state;
- provider-specific model discovery and coding-model filtering;
- in-app Agent/chat request transport;
- normalized quota card and provider-specific raw metrics;
- multiple accounts and account-scoped Agent assignments.

Excluded:

- launching or managing the original IDE/CLI applications;
- Cockpit multi-instance directories, executable discovery, terminal lifecycle and config injection into external apps;
- copying Cockpit's local files blindly. Imports must be explicit, validated and stored in BS Coding Vault.

## Capability acceptance gate

An adapter may be `ready` only when all of these pass against recorded fixtures and a live opt-in smoke test:

1. Connect/import creates a safe `ProviderAccount` and no secret reaches renderer/logs.
2. Refresh recovers an expired access token or reports a typed, actionable error.
3. At least one real provider model can create an in-app `LlmClient` request with tools and streaming behavior documented.
4. Model discovery returns stable ids and excludes non-code models when the adapter marks the account code-only.
5. Quota normalization maps all provider-specific windows/credits into `ProviderUsage` without inventing limits.
6. Active/Inactive and multi-account selection work in Agent settings and chat.

## Provider rollout matrix

| Phase | Provider family | Auth work | Runtime/model work | Quota work |
|---|---|---|---|---|
| 1 | GitHub Copilot | OAuth, token/JSON import | Copilot token exchange and chat/model endpoint | Inline suggestions + chat messages + plan/reset |
| 2 | Windsurf + Kiro | OAuth, token/JSON, local import | Codeium/Auth1 or Kiro runtime adapter | Plan, user prompt credits, add-on credits, reset |
| 3 | Cursor | OAuth, token/JSON, local import | Cursor access token/model endpoint | Total usage, Auto/Composer, API, On-Demand |
| 4 | Grok CLI | xAI OIDC device flow, API key, auth.json import | xAI and OpenAI-compatible BYOK paths | Billing/user/subscription and Code entitlement |
| 5 | CodeBuddy + CodeBuddy CN | OAuth, token/JSON, local client import | Regional endpoint and credential formats | Package, usage, add-on/credit metrics |
| 6 | Qoder | local import, JSON import | Qoder endpoint/model catalog | Credits, remaining amount, plan raw values |
| 7 | Trae family | local import, JSON import | Trae/Trae CN/SOLO regional endpoints | Dollar usage/total and reset |
| 8 | Zed | OAuth, JSON, current-login import | Zed OAuth/API endpoint | Subscription, Edit Predictions, Token Spend, Spend Limit |
| 9 | ZCode | Z.ai/BigModel OAuth, encrypted credential import | Z.ai/BigModel endpoint and model mapping | Subscription and per-model quota |
| 10 | Antigravity IDE | OAuth, refresh token, plugin sync import | Antigravity API/model transport | Model remaining quota and reset |

## Common file structure

- Create `src/main/providers/auth/` for OAuth/device/import helpers and redaction.
- Create `src/main/providers/adapters/<provider>.ts` for provider-specific behavior.
- Create `src/main/providers/usage/<provider>.ts` for quota normalization.
- Create `src/main/providers/fixtures/<provider>/` for sanitized HTTP/auth/usage fixtures.
- Extend `src/shared/providers.ts` with raw metric descriptors and typed provider error codes.
- Extend `src/shared/types.ts` with `ProviderRawUsage`, credential provenance, token refresh status and model transport capabilities.
- Keep renderer changes generic in `AddProviderModal.tsx`, `ProvidersTab.tsx`, `QuotaAccountCard.tsx`, and `AgentsTab.tsx`.

## Task 1: Harden common auth/session infrastructure

**Files:**
- Create: `src/main/providers/auth/device-flow.ts`
- Create: `src/main/providers/auth/import-normalizer.ts`
- Modify: `src/main/providers/types.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/connections/store.ts`
- Test: `tests/unit/provider-auth-session.test.ts`
- Test: `tests/unit/provider-import-normalizer.test.ts`

- [ ] Add failing tests for PKCE state isolation, device-code expiry, refresh-token rotation, JSON schema validation, secret redaction and account provenance.
- [ ] Implement a provider-neutral auth session state machine with login id, timeout, cancel, browser URL and callback/device completion states.
- [ ] Implement import normalization that accepts provider-declared JSON schemas only, rejects unknown required fields, and stores normalized secrets in Vault.
- [ ] Add typed errors (`oauth-state`, `device-expired`, `invalid-import`, `refresh-failed`, `unsupported-runtime`) and map them to safe UI messages.
- [ ] Run focused tests and `npm run typecheck`; commit `feat: harden provider auth sessions`.

## Task 2: GitHub Copilot adapter

**Files:**
- Create: `src/main/providers/adapters/github-copilot.ts`
- Create: `src/main/providers/usage/github-copilot.ts`
- Create: `src/main/providers/fixtures/github-copilot/`
- Test: `tests/unit/provider-github-copilot.test.ts`
- Test: `tests/integration/provider-github-copilot.test.ts`

- [ ] Record OAuth/token-import fixtures for token exchange, user profile, model list and quota response; redact tokens in fixtures.
- [ ] Implement OAuth and token/JSON import, account profile/plan detection and refresh behavior.
- [ ] Implement Copilot model discovery and request conversion to the existing `LlmClient` stream/tool contract.
- [ ] Normalize inline suggestion/chat message usage, reset windows and Free/Individual/Pro/Business/Enterprise plan metadata.
- [ ] Add multi-account selection and disabled-account integration coverage; mark `ready` only after live opt-in smoke passes.

## Task 3: Windsurf and Kiro adapters

**Files:**
- Create: `src/main/providers/adapters/windsurf.ts`
- Create: `src/main/providers/adapters/kiro.ts`
- Create: `src/main/providers/usage/windsurf.ts`
- Create: `src/main/providers/usage/kiro.ts`
- Create: `src/main/providers/fixtures/windsurf/`, `src/main/providers/fixtures/kiro/`
- Test: `tests/unit/provider-windsurf.test.ts`
- Test: `tests/unit/provider-kiro.test.ts`

- [ ] Add fixtures for OAuth/token JSON/local credential import and refresh responses.
- [ ] Implement each provider's import schema independently; do not share credentials between Windsurf and Kiro merely because both use Codeium-related services.
- [ ] Implement model discovery and request streaming/tool translation for each endpoint.
- [ ] Normalize plan, user prompt credits, add-on prompt credits and reset information for both providers.
- [ ] Add a negative fixture for expired/invalid Auth1 credentials and ensure the account becomes `error` with re-auth guidance.

## Task 4: Cursor adapter

**Files:**
- Create: `src/main/providers/adapters/cursor.ts`
- Create: `src/main/providers/usage/cursor.ts`
- Create: `src/main/providers/fixtures/cursor/`
- Test: `tests/unit/provider-cursor.test.ts`
- Test: `tests/integration/provider-cursor.test.ts`

- [ ] Implement OAuth, token/JSON import and local credential import with account profile normalization.
- [ ] Implement Cursor model catalog and request transport, including model id mapping and streaming/tool support.
- [ ] Normalize Total Usage, Auto + Composer, API Usage, On-Demand and billing-cycle reset values into raw metrics plus progress windows.
- [ ] Verify two Cursor accounts can be assigned to separate Agents without changing the other Agent's runtime credentials.

## Task 5: Grok CLI adapter

**Files:**
- Create: `src/main/providers/adapters/grok.ts`
- Create: `src/main/providers/auth/xai-device-flow.ts`
- Create: `src/main/providers/usage/grok.ts`
- Create: `src/main/providers/fixtures/grok/`
- Test: `tests/unit/provider-grok.test.ts`
- Test: `tests/integration/provider-grok.test.ts`

- [ ] Implement xAI OIDC device flow, official `auth.json` import, API key and third-party OpenAI-compatible base URL methods.
- [ ] Implement refresh-token rotation and account entitlement/profile detection.
- [ ] Implement xAI model catalog plus BYOK custom model validation; never send provider OAuth tokens to a user-supplied base URL.
- [ ] Normalize billing, user/subscription, product quota and Grok Code entitlement metrics.
- [ ] Add security tests proving tokens are excluded from exported account metadata and renderer IPC.

## Task 6: CodeBuddy family adapters

**Files:**
- Create: `src/main/providers/adapters/codebuddy.ts`
- Create: `src/main/providers/adapters/codebuddy-cn.ts`
- Create: `src/main/providers/usage/codebuddy.ts`
- Create: `src/main/providers/usage/codebuddy-cn.ts`
- Create: `src/main/providers/fixtures/codebuddy/`, `src/main/providers/fixtures/codebuddy-cn/`
- Test: `tests/unit/provider-codebuddy.test.ts`
- Test: `tests/unit/provider-codebuddy-cn.test.ts`

- [ ] Implement regional OAuth and token/JSON/local client import schemas separately.
- [ ] Implement regional API/model endpoint selection and code-model filtering.
- [ ] Normalize package, cycle, quota and add-on metrics; preserve official raw values for troubleshooting.
- [ ] Add locale-independent account labels and error messages.

## Task 7: Qoder and Trae family adapters

**Files:**
- Create: `src/main/providers/adapters/qoder.ts`
- Create: `src/main/providers/adapters/trae.ts`
- Create: `src/main/providers/usage/qoder.ts`
- Create: `src/main/providers/usage/trae.ts`
- Create: `src/main/providers/fixtures/qoder/`, `src/main/providers/fixtures/trae/`
- Test: `tests/unit/provider-qoder.test.ts`
- Test: `tests/unit/provider-trae.test.ts`

- [ ] Implement local/JSON credential imports with path allow-listing and no automatic filesystem scanning.
- [ ] Model the Trae, TRAE SOLO, Trae CN and TRAE SOLO CN variants as one adapter with explicit region/client variant metadata.
- [ ] Implement provider request/model mapping and validate that an imported account can create an in-app LLM client.
- [ ] Normalize Qoder credits and Trae dollar usage/total/reset metrics.

## Task 8: Zed and ZCode adapters

**Files:**
- Create: `src/main/providers/adapters/zed.ts`
- Create: `src/main/providers/adapters/zcode.ts`
- Create: `src/main/providers/auth/zcode-credentials.ts`
- Create: `src/main/providers/usage/zed.ts`
- Create: `src/main/providers/usage/zcode.ts`
- Create: `src/main/providers/fixtures/zed/`, `src/main/providers/fixtures/zcode/`
- Test: `tests/unit/provider-zed.test.ts`
- Test: `tests/unit/provider-zcode.test.ts`

- [ ] Implement Zed OAuth/JSON/current-login import and account profile discovery.
- [ ] Implement ZCode Z.ai/BigModel OAuth callback handling plus encrypted local credential import; never treat encrypted credentials as plain API keys.
- [ ] Implement model mapping and request transport for both providers.
- [ ] Normalize Zed subscription/Edit Predictions/Token Spend/Spend Limit and ZCode subscription/per-model quotas.

## Task 9: Antigravity adapter

**Files:**
- Create: `src/main/providers/adapters/antigravity.ts`
- Create: `src/main/providers/usage/antigravity.ts`
- Create: `src/main/providers/fixtures/antigravity/`
- Test: `tests/unit/provider-antigravity.test.ts`
- Test: `tests/integration/provider-antigravity.test.ts`

- [ ] Implement OAuth, refresh-token and explicit plugin-sync import methods.
- [ ] Implement Antigravity model catalog, request transport and model-specific quota windows.
- [ ] Normalize account plan, model remaining quota and reset time.
- [ ] Add security tests for plugin sync input and path validation.

## Task 10: Generic UI, Agent and quota completion

**Files:**
- Modify: `src/renderer/src/components/settings/AddProviderModal.tsx`
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/components/settings/AgentsTab.tsx`
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`
- Test: `tests/e2e/provider-settings.spec.ts`
- Test: `tests/e2e/provider-agent-assignment.spec.ts`

- [ ] Render provider-declared auth fields, import instructions, OAuth/device progress, refresh errors and capability badges without provider-specific branching in the page.
- [ ] Show only `ready` adapters by default, with an explicit “Experimental” filter for adapters awaiting live verification.
- [ ] Group Agent model choices by provider/account and hide disabled/error accounts.
- [ ] Render provider raw quota metrics in an expandable details area while preserving the approved full-width card layout.
- [ ] Add account-level speed controls only when the provider model declares Standard/Fast support.

## Task 11: Live verification harness and rollout controls

**Files:**
- Create: `tests/integration/provider-live-smoke.test.ts`
- Create: `docs/provider-support.md`
- Create: `docs/provider-live-verification.md`
- Modify: `src/main/providers/registry.ts`
- Modify: `src/main/providers/types.ts`

- [ ] Add opt-in environment-gated live tests (`BS_PROVIDER_LIVE=1`) that never run in default CI and never print secrets.
- [ ] Add adapter health states: `ready`, `experimental`, `blocked`, with reason and last verified timestamp.
- [ ] Require recorded fixture tests plus one live verification record before promoting an adapter to `ready`.
- [ ] Document each provider's supported methods, runtime limitations, quota fields, refresh behavior and known endpoint caveats.

## Task 12: Full verification

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test` and require all unit/integration tests to pass.
- [ ] Run `npm run build`.
- [ ] Run `npm run e2e` and require provider settings/assignment tests to pass; existing unrelated flaky tests must be isolated and documented.
- [ ] Run the opt-in live smoke suite for every provider available in the test environment.
- [ ] Run `git diff --check`, audit renderer bundles/IPC snapshots for secret leakage, and update the changelog.

## Delivery checkpoints

- Checkpoint A: common auth/session and GitHub Copilot are ready.
- Checkpoint B: Windsurf, Kiro and Cursor are ready with quota cards.
- Checkpoint C: Grok, CodeBuddy family, Qoder and Trae family are ready.
- Checkpoint D: Zed, ZCode and Antigravity are ready.
- Checkpoint E: all adapters pass live verification and are promoted from experimental to ready.
