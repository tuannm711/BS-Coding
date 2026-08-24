# Provider and Agent Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Providers, Agents, Chat agent selection, and account-level quota around a clear provider-account-model architecture.

**Architecture:** Keep secrets and quota acquisition in the main process. Persist Agent assignments as provider/account/model/variant references. Expose safe account metadata and normalized usage through existing IPC, then make Providers, Agents, AgentPicker, and the right-panel quota consume those contracts.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, existing IPC and safe vault stores.

---

### Task 1: Extend shared agent/provider contracts

**Files:** `src/shared/types.ts`, `src/shared/ipc.ts`, `tests/unit/ipc-contract.test.ts`

- [ ] Add explicit `AgentVariantAssignment` fields to the existing agent settings/assignment types without removing legacy `model` compatibility.
- [ ] Add safe account quota metadata fields needed by Providers and right-panel rendering: `planName`, `bankedUsed`, `bankedLimit`, `subscriptionExpiresAt`, `refreshedAt`, and `unavailableReason`.
- [ ] Keep all IPC channels centralized and update contract tests for the new return shapes.
- [ ] Run `npm test -- tests/unit/ipc-contract.test.ts` and confirm pass.
- [ ] Commit: `feat: define account-level quota and agent assignment contracts`.

### Task 2: Implement real provider-account quota refresh

**Files:** `src/main/connections/usage.ts`, `src/main/connections/manager.ts`, `src/main/index.ts`, `tests/unit/connections-usage.test.ts`, `tests/unit/connections-manager.test.ts`

- [ ] Add an OpenAI Codex usage adapter that calls the account-level Codex usage endpoint with the decrypted OAuth access token and account ID header.
- [ ] Normalize primary quota, banked quota, reset timestamps, plan, subscription expiry, and unavailable/error states into `ProviderUsage`.
- [ ] Make `ProviderManager.refreshUsage()` fetch and persist fresh usage instead of returning only cached `account.usage`; broadcast the normalized result through `EventProviderUsage`.
- [ ] Add deterministic fetch stubs covering success, missing quota windows, HTTP errors, and expired accounts.
- [ ] Run the focused usage tests, then `npm test -- tests/unit/connections-usage.test.ts tests/unit/connections-manager.test.ts`.
- [ ] Commit: `feat: refresh and persist provider account quota`.

### Task 3: Redesign Providers tab around provider cards and account quota

**Files:** `src/renderer/src/components/settings/ProvidersTab.tsx`, `src/renderer/src/styles.css`, `tests/unit/providers-tab.test.tsx`

- [ ] Replace the flat connected-provider rows with provider cards containing header state, account count, model count, and actions.
- [ ] Render nested account cards with enable/disable/switch/remove, plan metadata, quota used/limit, banked quota, reset countdown, expiry, refreshed timestamp, and a `Refresh quota` action.
- [ ] Subscribe to account and usage events; refresh quota on mount and after OAuth callback. Display an actionable unavailable state rather than a blank value.
- [ ] Keep API-key providers and OAuth providers in the same card model; do not expose secrets.
- [ ] Add component tests for multiple accounts and account-level quota rendering.
- [ ] Run the focused renderer test and typecheck.
- [ ] Commit: `feat: redesign providers account cards`.

### Task 4: Redesign Agents tab as editable assignment cards

**Files:** `src/renderer/src/components/settings/AgentsTab.tsx`, `src/renderer/src/styles.css`, `tests/unit/agents-tab.test.tsx`

- [ ] Render each Agent as a card with name, optional system prompt, enabled state, provider/account/model/variant assignment rail, and explicit edit/duplicate/enable/disable/remove actions.
- [ ] Filter account options by selected provider and model options by selected account/provider; preserve the active OAuth account fallback.
- [ ] Add a clear “Use default prompt” control and inline empty-assignment guidance.
- [ ] Keep subagent role configuration separate below the primary Agent list so it is not confused with user-facing Agents.
- [ ] Add tests for creating an Agent, changing its assignment, and preserving optional prompts.
- [ ] Run focused tests and typecheck.
- [ ] Commit: `feat: redesign agent assignment cards`.

### Task 5: Replace chat ModelPicker with AgentPicker

**Files:** `src/renderer/src/components/chat/ModelPicker.tsx`, `src/renderer/src/components/chat/AgentPicker.tsx`, `src/renderer/src/components/chat/ChatPanel.tsx`, `src/renderer/src/components/Pane.tsx`, `tests/unit/agent-picker.test.tsx`

- [ ] Add an AgentPicker that loads user-facing Agent definitions and displays name, provider, account, model, and variant in the menu.
- [ ] Persist only the selected Agent ID/session selection from chat; do not mutate provider/model assignment from the chat control.
- [ ] Update ChatPanel header and context footer labels to use the selected Agent while retaining the resolved model for diagnostics.
- [ ] Keep a compatibility path for existing sessions that only have a model assignment.
- [ ] Add tests for AgentPicker selection and assignment immutability.
- [ ] Run focused tests and build.
- [ ] Commit: `feat: select configured agents from chat`.

### Task 6: Rebuild right-panel quota as account-level session view

**Files:** `src/renderer/src/components/RightPanelQuota.tsx`, `src/renderer/src/components/RightPanel.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `tests/unit/right-panel-quota.test.tsx`

- [ ] Group active session Agents by `provider/accountId`, not by Agent or model.
- [ ] For each account row list models and Agents using it, then show shared quota, banked quota, reset, expiry, freshness, and unavailable reason.
- [ ] Subscribe to chat usage, account changes, and provider usage events; refresh assignments when Agents change.
- [ ] Keep the card at roughly 20% right-panel height and preserve independent Explorer/Artifacts scrolling.
- [ ] Add tests for two Agents sharing one account and two models sharing one account.
- [ ] Run focused tests and full UI build.
- [ ] Commit: `feat: show account-level quota in right panel`.

### Task 7: Verification and migration checks

**Files:** `tests/unit/agent-config.test.ts`, `tests/unit/bs-agent-manager.test.ts`, `docs/superpowers/specs/2026-08-23-provider-agent-control-room-design.md`

- [ ] Add migration tests proving legacy `provider/model` assignments still resolve and new account-aware assignments select the correct OAuth/API account.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build && npm run e2e` because Providers, Agents, Chat, and right-panel layout changed.
- [ ] Review keyboard focus, disabled/expired states, compact window layout, and quota unavailable messaging.
- [ ] Commit: `test: verify provider agent control room redesign`.
