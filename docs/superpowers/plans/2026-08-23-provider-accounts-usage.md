# Provider Accounts, OAuth, Responses Compaction & Live Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-account provider connections (API key and ChatGPT/Codex OAuth), per-agent account assignment, OpenAI Responses compaction, provider usage monitoring, and live per-agent chat cards.

**Architecture:** Keep `ProvidersTab` as the single connection entry point. Add a main-process `ProviderAccountStore` and provider adapters behind centralized IPC; renderer receives only metadata and normalized usage. Add an OpenAI Responses client implementing the existing `LlmClient` boundary, while preserving existing clients for non-OpenAI providers. Agent configuration stores provider/account/model references, and chat monitor state is fed by main-process events.

**Tech Stack:** Electron 41, TypeScript strict, React 19, Vercel AI SDK 6, OpenAI Responses HTTP API, Electron `safeStorage`, Vitest, Playwright.

---

## File map

- Create `src/main/connections/types.ts`, `vault.ts`, `store.ts`, `oauth.ts`, `codex.ts`, `usage.ts`, `manager.ts` for account metadata, encrypted secrets, OAuth, Codex credential injection, usage adapters, and orchestration.
- Modify `src/shared/types.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` for account/usage/assignment contracts.
- Modify `src/main/agent/config.ts`, `src/main/bs-agent-manager.ts`, `src/main/index.ts` for migration, runtime resolution, events, and IPC handlers.
- Create `src/main/agent/openai-responses.ts`; modify `src/main/agent/llm.ts`, `loop.ts`, and `session.ts` for Responses state and usage.
- Modify `src/renderer/src/components/settings/ProvidersTab.tsx`, agent configuration components, and chat layout components for account selection and live cards.
- Create focused tests under `tests/unit/connections/`, `tests/unit/agent/`, `tests/unit/renderer/`, plus targeted Playwright coverage.

## Task 1: Shared provider-account and usage contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/ipc-contract.test.ts`, `tests/unit/shared-types.test.ts`

- [ ] Write failing tests asserting account status/auth mode, normalized usage, agent assignment, and IPC channel names are represented without exposing secrets.
- [ ] Run `npm test -- tests/unit/ipc-contract.test.ts tests/unit/shared-types.test.ts`; expect failures for missing types/channels.
- [ ] Add `ProviderAccount`, `ProviderUsage`, `ProviderConnection`, `AgentModelAssignment`, and event variants for account changes, usage updates, compaction state, and live agent monitor updates.
- [ ] Add channels for provider account list/connect/login/cancel/enable/disable/switch/remove/refresh and agent assignment; expose typed `window.api` methods through `contextBridge` only.
- [ ] Run the focused tests and `npm run typecheck`; expect PASS.
- [ ] Commit `feat(shared): add provider account and usage contracts`.

## Task 2: Vault, account store, and migration

**Files:**
- Create: `src/main/connections/types.ts`
- Create: `src/main/connections/vault.ts`
- Create: `src/main/connections/store.ts`
- Modify: `src/main/agent/config.ts`
- Test: `tests/unit/connections/vault.test.ts`, `tests/unit/connections/store.test.ts`, `tests/unit/agent/config-migration.test.ts`

- [ ] Write failing tests for safeStorage encryption/decryption, account CRUD, disabled-account retention, atomic metadata writes, and migration from existing `ProviderSettings.apiKey` to `keyRef`.
- [ ] Run the focused tests; expect failures because the connections modules do not exist.
- [ ] Implement a main-only vault using Electron `safeStorage`; when encryption is unavailable return a typed error and never silently write plaintext OAuth tokens.
- [ ] Implement `ProviderAccountStore` with one metadata index and one encrypted secret record per account, atomic temp-file rename, and deterministic migration IDs for legacy providers.
- [ ] Update `loadBsConfig`/`settingsToConfig`/`configToSettings` to preserve legacy settings while resolving account references.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`; expect PASS.
- [ ] Commit `feat(connections): add encrypted account store and provider migration`.

## Task 3: OAuth PKCE and Codex adapter

**Files:**
- Create: `src/main/connections/oauth.ts`
- Create: `src/main/connections/codex.ts`
- Test: `tests/unit/connections/oauth.test.ts`, `tests/unit/connections/codex.test.ts`

- [ ] Write failing tests for verifier/challenge generation, state TTL, callback success/error/timeout, token exchange payload, refresh, JWT profile extraction, and auth.json merge/backup.
- [ ] Run focused tests; expect failures for missing OAuth functions.
- [ ] Implement PKCE with Node crypto, a loopback callback server bound only to `127.0.0.1`, one pending login per ID, five-minute expiry, and explicit port-in-use errors.
- [ ] Implement Codex adapter constants and HTTP calls for authorize/token/refresh, profile extraction, and account metadata; use the documented Codex user-agent/originator headers.
- [ ] Implement atomic `~/.codex/auth.json` merge preserving unrelated fields and writing a backup before the first BS-managed replacement.
- [ ] Run focused tests and `npm run typecheck`; expect PASS.
- [ ] Commit `feat(connections): add Codex OAuth account adapter`.

## Task 4: Provider manager and main-process IPC

**Files:**
- Create: `src/main/connections/manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/connections/manager.test.ts`, `tests/unit/main-ipc.test.ts`

- [ ] Write failing tests for connect API key, OAuth login lifecycle, enable/disable, switch, remove, refresh, and secret-free renderer responses.
- [ ] Run focused tests; expect failures for missing manager/handlers.
- [ ] Implement `ProviderManager` as the only orchestrator for account store, vault, OAuth adapter, and provider model catalog.
- [ ] Register all handlers using `Channels`; translate errors into `[bs]` Vietnamese messages and emit account-change events.
- [ ] Update `BsAgentManager` dependency wiring so account resolution happens in main and no API key/token is sent through renderer IPC.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`; expect PASS.
- [ ] Commit `feat(connections): wire provider account lifecycle through IPC`.

## Task 5: OpenAI Responses client and compaction state

**Files:**
- Create: `src/main/agent/openai-responses.ts`
- Modify: `src/main/agent/llm.ts`
- Modify: `src/main/agent/loop.ts`
- Modify: `src/main/agent/session.ts`
- Test: `tests/unit/agent/openai-responses.test.ts`, `tests/unit/agent/agent-loop.test.ts`

- [ ] Write failing tests for Responses request payload, tool conversion, streaming event mapping, usage mapping, continuation state isolation by account, compact threshold, and fallback to existing compaction.
- [ ] Run focused tests; expect failures for the new client/state.
- [ ] Implement an OpenAI Responses client behind `LlmClient`; keep API key in main-process closure, map tool calls/results, and expose response ID/opaque compaction items through internal state only.
- [ ] Add per-session/per-account response state and call `/responses/compact` before the configured threshold; on unsupported/error responses call the existing local compactor without losing the transcript.
- [ ] Ensure switching account clears continuation state and never mixes response items across accounts.
- [ ] Map `input_tokens`, cached input, output, and reasoning usage into `MessageTokens`; emit `compacting` and `compacted` events.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`; expect PASS.
- [ ] Commit `feat(agent): add OpenAI Responses continuation and compaction`.

## Task 6: Agent provider/account/model assignment and fallback

**Files:**
- Modify: `src/shared/types.ts`, `src/main/agent/config.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Modify: agent settings components under `src/renderer/src/components/settings/`
- Test: `tests/unit/agent/agent-assignment.test.ts`, `tests/unit/renderer/agent-settings.test.ts`

- [ ] Write failing tests for explicit account selection, `Auto` selection, disabled/expired exclusion, quota-aware ordering, fallback after auth/quota error, and turn-boundary assignment changes.
- [ ] Run focused tests; expect failures for account-aware resolution.
- [ ] Add optional account/fallback references to agent settings and migrate existing agents to `Auto` without changing behavior.
- [ ] Resolve credentials in main, select only active accounts for `Auto`, prefer healthy accounts with available quota, and switch only at the next turn boundary.
- [ ] Add account/model controls to agent settings and persist through existing settings IPC.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`; expect PASS.
- [ ] Commit `feat(agent): assign provider accounts per agent`.

## Task 7: Usage adapters and refresh scheduler

**Files:**
- Create: `src/main/connections/usage.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/connections/usage.test.ts`, `tests/unit/connections/usage-scheduler.test.ts`

- [ ] Write failing tests for OpenAI Codex usage normalization, API-key usage fallback, Anthropic normalization, unavailable provider handling, reset countdown data, and 90% alert cooldown.
- [ ] Run focused tests; expect failures for missing adapters/scheduler.
- [ ] Implement adapter interfaces and provider-specific normalizers; preserve raw payload only in main-side diagnostic storage and expose normalized safe fields.
- [ ] Add refresh on Providers tab open, login/switch, and a 45-minute scheduler; refresh errors set `unavailable` and do not terminate running agents.
- [ ] Emit quota events and `[bs]` notification alerts with a five-minute per-account cooldown.
- [ ] Run focused tests, `npm run typecheck`, and `npm test`; expect PASS.
- [ ] Commit `feat(connections): add provider usage adapters and refresh scheduler`.

## Task 8: Providers UI with multi-account management

**Files:**
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: related settings styles/components
- Test: `tests/unit/renderer/providers-tab.test.tsx`, `tests/e2e/providers-accounts.spec.ts`

- [ ] Write failing UI tests for provider grouping, API-key connect, OAuth login button/callback state, account enable/disable, switch, remove, and quota cards.
- [ ] Run focused UI tests; expect failures for account-aware rendering.
- [ ] Replace the single connected-provider row with provider groups and account rows; keep API-key flow and add `Sign in with ChatGPT/Codex` in the same connect flow.
- [ ] Add masked credential labels, status badges, usage/reset/expiry fields, refresh controls, and explicit unavailable states.
- [ ] Wire event subscriptions so the tab updates without reload and does not receive secrets.
- [ ] Run `npm run typecheck`, focused tests, `npm run build`, and the targeted Playwright spec; expect PASS.
- [ ] Commit `feat(ui): manage multi-account providers and usage`.

## Task 9: Live agent monitor cards in chat

**Files:**
- Modify: existing chat layout and agent panel components under `src/renderer/src/components/`
- Create: `src/renderer/src/components/chat/AgentUsageCard.tsx`
- Modify: renderer styles and event subscription hook
- Test: `tests/unit/renderer/agent-usage-card.test.tsx`, `tests/e2e/chat-agent-monitor.spec.ts`

- [ ] Write failing tests for running/idle/compacting/error states, per-turn and session token updates, context percentage, quota/reset/expiry display, compact event, Stop action, and Change account availability.
- [ ] Run focused UI tests; expect failures because the card does not exist.
- [ ] Implement a pure presentation card consuming safe monitor state keyed by `agentId`/`accountId`; show official/internal/unavailable data labels and responsive compact mode.
- [ ] Subscribe to main-process usage/quota/compaction events through preload APIs; route Stop and Change account through existing IPC contracts.
- [ ] Render one card per project agent and apply turn-boundary account changes.
- [ ] Run `npm run typecheck`, focused tests, `npm run build`, and the targeted Playwright spec; expect PASS.
- [ ] Commit `feat(ui): add live per-agent usage cards to chat`.

## Task 10: Full regression, migration verification, and release checks

**Files:**
- Modify: `docs/changelog-format.md` or the current release changelog file if required by repository convention
- Create: `tests/e2e/provider-account-multi-agent.spec.ts` if coverage is not already composed by Tasks 8–9

- [ ] Add an end-to-end scenario that connects two accounts, assigns them to two agents in one project, runs both, verifies independent monitor cards, disables one account, and confirms the other agent remains usable.
- [ ] Run `npm run typecheck`; expect exit 0.
- [ ] Run `npm test`; expect all unit/integration tests pass.
- [ ] Run `npm run build && npm run e2e`; expect all existing and new smoke tests pass.
- [ ] Run `git diff --check` and inspect `git status --short`; confirm no credentials, tokens, or generated user-data files are tracked.
- [ ] Commit `test: verify provider accounts and live usage end to end`.

## Self-review checklist

- Provider/API-key and OAuth connections share one Providers UI: Tasks 4 and 8.
- Multiple accounts, enable/disable, switch, refresh, and secure storage: Tasks 2–4 and 8.
- Per-agent provider/account/model selection and fallback: Task 6.
- Responses continuation, compaction, usage mapping, and account isolation: Task 5.
- Quota, banked usage, reset countdown, and plan expiry: Task 7 and UI Tasks 8–9.
- Live monitor card per agent in chat: Task 9.
- IPC/security and required verification commands: Tasks 1, 4, and 10.
- No unresolved TODO/TBD placeholders are used in the plan.

