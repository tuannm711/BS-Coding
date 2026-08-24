# Provider Adapter Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make connected provider accounts, authentication methods, models, runtime requests and quota data work through one adapter-driven system inside BS Coding.

**Architecture:** Keep provider lifecycle in the main process and expose safe metadata through centralized IPC. A registry resolves provider adapters; adapters implement OAuth/API/import, model discovery, request-client creation and optional usage normalization. Agents reference provider/account/model and the renderer uses a modal plus vertical quota cards.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, Playwright, existing Vault/IPC/LlmClient/QuotaAccountCard.

---

## File map and boundaries

- Create `src/shared/providers.ts` for auth-method, capability, model and adapter-safe contracts.
- Modify `src/shared/types.ts` only for account capability metadata and validated assignment fields.
- Modify `src/shared/ipc.ts` and `src/preload/index.ts` for capability-driven connect flow and safe payloads.
- Create `src/main/providers/registry.ts`, `src/main/providers/types.ts`, `src/main/providers/adapters/openai.ts` and `src/main/providers/adapters/fixture.ts`; adapters own provider-specific behavior.
- Modify `src/main/connections/manager.ts` to delegate lifecycle and usage to the registry while preserving existing OpenAI OAuth behavior.
- Modify `src/main/connections/store.ts` and add migration coverage in `tests/unit/connections-store.test.ts` and `tests/unit/bs-migration.test.ts`.
- Modify `src/main/bs-agent-manager.ts` and `src/main/agent/llm.ts` only at the runtime boundary; Agent loop must not know auth details.
- Create `src/renderer/src/components/settings/AddProviderModal.tsx`; replace catalog/manual branches in `ProvidersTab.tsx` with capability-driven connected-account and modal state.
- Modify `src/renderer/src/components/quota/QuotaAccountCard.tsx` only for reusable Active/Inactive and Standard/Fast controls; keep `RightPanelQuota.tsx` behavior intact.
- Add unit tests under `tests/unit/providers-*.test.ts`, integration tests under `tests/integration/providers-flow.test.ts`, and update affected E2E specs.

### Task 1: Define shared provider contracts

**Files:**
- Create: `src/shared/providers.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Test: `tests/unit/provider-contracts.test.ts`

- [ ] **Step 1: Write failing contract tests** for capability filtering, auth method descriptors, model capability flags, and assignment validation.
- [ ] **Step 2: Run `npm test -- tests/unit/provider-contracts.test.ts`** and confirm failures identify missing contracts.
- [ ] **Step 3: Add contracts**: `ProviderCapability`, `AuthMethodDescriptor`, `ProviderModel`, `ProviderAssignment`, safe `ProviderConnectRequest/Result`, and `ProviderAdapterId`; keep secret-bearing input types main-process-only.
- [ ] **Step 4: Extend `ProviderAccount`** with optional `capabilities` and `lastError`, and constrain `AgentModelAssignment.speed` to `standard | fast`.
- [ ] **Step 5: Add IPC channel names and `AgentApi` signatures** for listing capabilities and starting/submitting/canceling a connection.
- [ ] **Step 6: Run `npm test -- tests/unit/provider-contracts.test.ts` and `npm run typecheck`; commit `feat: add provider adapter contracts`.

### Task 2: Build registry and account-safe adapter boundary

**Files:**
- Create: `src/main/providers/types.ts`
- Create: `src/main/providers/registry.ts`
- Create: `src/main/providers/adapters/fixture.ts`
- Test: `tests/unit/providers-registry.test.ts`

- [ ] **Step 1: Write failing tests** for registering an adapter, hiding unsupported adapters, resolving methods, and rejecting duplicate ids.
- [ ] **Step 2: Run the focused Vitest file** and confirm expected failures.
- [ ] **Step 3: Implement `ProviderRegistry`** with `register`, `get`, `listReady`, and `methods(providerId)`; return renderer-safe descriptors only.
- [ ] **Step 4: Implement `ProviderAdapterContext`** with Vault access, `openExternal`, fetch, account store and redaction helpers; prohibit context methods from returning raw secrets.
- [ ] **Step 5: Add fixture adapter** with API-key and imported JSON methods, deterministic models and usage fixture for integration tests.
- [ ] **Step 6: Run registry tests and typecheck; commit `feat: add provider adapter registry`.

### Task 3: Refactor connection manager and migration

**Files:**
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/connections/store.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/connections-manager.test.ts`
- Test: `tests/unit/connections-store.test.ts`
- Test: `tests/unit/bs-migration.test.ts`

- [ ] **Step 1: Add failing tests** for API-key connection, imported JSON connection, account disable/activate, OAuth account preservation and secret deletion on remove.
- [ ] **Step 2: Run the focused tests** and confirm the current OpenAI-only manager fails the generic cases.
- [ ] **Step 3: Inject a registry into `ProviderManager`** and route `connect`, `refresh`, `listModels`, `createClient`, `fetchUsage`, `setEnabled` and `remove` through adapter/account ids.
- [ ] **Step 4: Preserve `startLogin('openai')`** behind the OpenAI adapter and return the existing login id/auth URL shape through the new connect session channel.
- [ ] **Step 5: Add legacy migration** from `ProviderSettings` API keys into Vault-backed account records; mark failed migrations `error` without logging or returning the key.
- [ ] **Step 6: Register OpenAI and fixture adapters at app startup**, add IPC handlers using `Channels`, and run the focused tests plus `npm run typecheck`; commit `feat: route connections through provider registry`.

### Task 4: Implement OpenAI/ChatGPT adapter and normalized usage

**Files:**
- Create: `src/main/providers/adapters/openai.ts`
- Modify: `src/main/connections/codex.ts`
- Modify: `src/main/connections/usage.ts`
- Modify: `src/shared/openai-oauth.ts`
- Test: `tests/unit/provider-openai-adapter.test.ts`
- Test: `tests/unit/connections-usage.test.ts`

- [ ] **Step 1: Write failing tests** for OAuth profile normalization, code-model-only filtering, token refresh threshold, 5-hour/weekly remaining percentages and subscription metadata.
- [ ] **Step 2: Run focused tests** and confirm missing adapter behavior.
- [ ] **Step 3: Move existing PKCE/exchange/profile logic behind the adapter** without changing callback port 1455 or Codex auth-file merge semantics.
- [ ] **Step 4: Implement API-key and OAuth client creation** using existing `createLlm` boundaries; select only `OPENAI_OAUTH_MODELS` for OAuth accounts.
- [ ] **Step 5: Normalize quota** into `ProviderUsage`, preserving unavailable responses and never inventing limits from errors.
- [ ] **Step 6: Run OpenAI usage tests, `npm run typecheck` and `npm test -- tests/unit/connections-usage.test.ts`; commit `feat: add OpenAI provider adapter`.

### Task 5: Integrate runtime assignment with Agents

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/agent/llm.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`
- Test: `tests/unit/agent-llm.test.ts`

- [ ] **Step 1: Write failing tests** for active-account resolution, disabled/expired account rejection, model validation and explicit fallback behavior.
- [ ] **Step 2: Run focused tests** and confirm current provider-only resolution cannot select account ids.
- [ ] **Step 3: Add a `ProviderRuntime` dependency** to `BsAgentManager`; resolve `{provider, accountId, model, speed}` before creating an `LlmClient`.
- [ ] **Step 4: Keep the Agent loop provider-agnostic**; return `[bs]` Vietnamese errors with a Settings hint when account refresh or model validation fails.
- [ ] **Step 5: Update model enumeration** to return models from active accounts only and preserve explicit user fallback assignments.
- [ ] **Step 6: Run focused tests, `npm run typecheck`, and commit `feat: bind agents to provider accounts`.

### Task 6: Build capability-driven Add provider modal

**Files:**
- Create: `src/renderer/src/components/settings/AddProviderModal.tsx`
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/components/settings/Modal.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/e2e/provider-settings.spec.ts`

- [ ] **Step 1: Add Playwright tests** in `tests/e2e/provider-settings.spec.ts` for provider → method selection, OAuth browser state, API-key fields, import validation, cancel and retry.
- [ ] **Step 2: Run `npm run build && npx playwright test tests/e2e/provider-settings.spec.ts`** and confirm the existing manual modal lacks capability-driven states.
- [ ] **Step 3: Implement `AddProviderModal`** with searchable provider list, method list from `provider:capabilities`, back navigation, method-specific fields, loading/error states and one-time import payload handling.
- [ ] **Step 4: Replace catalog/manual rendering** in `ProvidersTab` with connected accounts only plus the split Add provider button and modal open state.
- [ ] **Step 5: Preserve account-change and usage subscriptions** so a completed OAuth flow appears without removing another provider.
- [ ] **Step 6: Run UI tests and `npm run typecheck`; commit `feat: redesign provider connection modal`.

### Task 7: Finish vertical quota cards and account actions

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/unit/quota-view.test.ts`
- Test: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Add failing tests** for vertical full-width card data, Standard/Fast `aria-pressed` buttons, `Active` + `Deactivate`, and `Inactive` + `Activate` labels.
- [ ] **Step 2: Implement reusable account-action controls** with optimistic loading state, rollback on IPC failure and accessible labels.
- [ ] **Step 3: Render one full-width card per account** in `ProvidersTab`; preserve quota-unavailable state and refresh action.
- [ ] **Step 4: Keep `RightPanelQuota` session-scoped** while sharing the same card component and usage formatting.
- [ ] **Step 5: Run quota tests and the affected Playwright smoke; commit `feat: add provider account controls to quota cards`.

### Task 8: Add provider rollout adapters

**Files:**
- Create: `src/main/providers/adapters/copilot.ts`
- Create: `src/main/providers/adapters/cursor.ts`
- Create: `src/main/providers/adapters/windsurf.ts`
- Create: `src/main/providers/adapters/kiro.ts`
- Create: `src/main/providers/adapters/grok.ts`
- Create: `src/main/providers/adapters/imported.ts`
- Test: `tests/unit/providers-capability-matrix.test.ts`
- Test: `tests/integration/providers-flow.test.ts`

- [ ] **Step 1: Add capability-matrix fixtures** covering each provider's declared methods, required fields, model client type and usage support.
- [ ] **Step 2: Implement GitHub Copilot OAuth/token import** and verify account/model request flow with fixture HTTP responses.
- [ ] **Step 3: Implement Cursor, Windsurf and Kiro OAuth/local/JSON import adapters** using the same secret normalization and refresh contract.
- [ ] **Step 4: Implement Grok OAuth/API/OpenAI-compatible base URL** with explicit user-supplied base URL validation.
- [ ] **Step 5: Implement `codebuddy.ts`, `qoder.ts`, `trae.ts`, `zed.ts` and `zcode.ts`** with the exact local/JSON/OAuth methods declared by each capability fixture, reusing the imported adapter helpers.
- [ ] **Step 6: Add integration flow**: connect fixture account → card → activate → assign Agent → send request → usage event; commit each provider family in a separate focused commit.

### Task 9: Verification and documentation

**Files:**
- Create: `docs/provider-support.md`
- Create: `docs/changelog-provider-adapters.md` using the structure in `docs/changelog-format.md`
- Test: all affected unit/integration/E2E tests

- [ ] **Step 1: Run `npm run typecheck` and fix all strict TypeScript errors.**
- [ ] **Step 2: Run `npm test` and record the passing test count.**
- [ ] **Step 3: Run `npm run build && npm run e2e` because provider and chat UI changed.**
- [ ] **Step 4: Verify no secret values appear in logs, IPC payload snapshots or renderer state.**
- [ ] **Step 5: Write `docs/provider-support.md`** with the supported provider methods, unavailable quota behavior and account activation semantics.
- [ ] **Step 6: Commit `docs: document provider adapter support` and run `git diff --check`.**

## Execution checkpoints

- After Task 3, existing OpenAI OAuth and API-key flows must still work before adding more adapters.
- After Task 6, the Add provider modal and connected-only list must be usable with the fixture adapter before provider rollout.
- After Task 7, Providers and Chat quota cards must share formatting and remain readable at the current right-panel width.
- After Task 8, every provider shown in the Add provider menu must have at least one tested connection method that can create an in-app model client.
