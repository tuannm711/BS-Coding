# Cockpit-style Provider Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make provider connections, account selection, agent model persistence, runtime transport and quota state use one canonical, Cockpit-style architecture.

**Architecture:** Introduce a versioned provider snapshot and explicit agent assignment store. Provider adapters own connection, model discovery, runtime and usage behavior; the main process exposes snapshots and mutation events through centralized IPC; renderer Settings, Agents and quota cards consume those snapshots without local assignment inference.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, existing Vault/JSON stores, `fetch` with provider-specific streaming clients.

**Spec:** `docs/superpowers/specs/2026-08-23-cockpit-provider-architecture-design.md`

## Global Constraints

- Keep secrets main-process-only; renderer receives masked account data.
- Use `Channels` from `src/shared/ipc.ts`; do not add literal IPC channel strings.
- Preserve `contextIsolation: true`, `nodeIntegration: false`, and existing PTY behavior.
- Source/UI labels stay English; main-process errors remain Vietnamese with `[bs]` prefix.
- OAuth providers must never fall through to OpenAI-compatible transport.
- Run `npm run typecheck` and targeted Vitest tests after each task; run full `npm test` before completion.

## File map

- `src/shared/provider-state.ts`: provider definitions, account/model snapshots, assignment and error state types.
- `src/shared/ipc.ts`: snapshot, assignment and change-event channels.
- `src/shared/types.ts`: compatibility aliases for existing renderer/main types.
- `src/main/providers/types.ts`: adapter contracts and runtime/usage interfaces.
- `src/main/providers/registry.ts`: provider registration and capability lookup.
- `src/main/connections/store.ts`: account persistence and Vault references.
- `src/main/connections/manager.ts`: connection lifecycle, model refresh and usage orchestration.
- `src/main/agent/assignments.ts`: versioned assignment persistence/migration.
- `src/main/bs-agent-manager.ts`: resolve assignments and create adapter-owned runtimes.
- `src/main/index.ts`: initialize provider state before workspace agents and register IPC handlers.
- `src/renderer/src/components/settings/ProvidersTab.tsx`: Cockpit-style account dashboard.
- `src/renderer/src/components/settings/AgentsTab.tsx`: explicit provider/account/model/speed assignment form.
- `src/renderer/src/components/RightPanelQuota.tsx`: snapshot-driven quota cards.
- `src/renderer/src/components/quota/QuotaAccountCard.tsx`: ready/exhausted/unavailable/cooldown states.
- `tests/unit/provider-state.test.ts`, `tests/unit/agent-assignments.test.ts`, `tests/unit/provider-snapshot.test.ts`: contract, migration and event tests.
- `tests/unit/renderer-agent-assignment.test.tsx`, `tests/unit/quota-snapshot.test.tsx`: renderer persistence and live refresh tests.

---

### Task 1: Define canonical provider state and IPC contracts

**Files:**
- Create: `src/shared/provider-state.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/provider-state.test.ts`

**Interfaces:**
- Produce `ProviderDefinition`, `ProviderAccountSnapshot`, `ProviderModelRef`, `ProviderUsageSnapshot`, `AgentAssignment`, `ProviderSnapshot`, `ProviderErrorState`.
- Produce channels `ProviderSnapshotGet`, `ProviderSnapshotChanged`, `AgentAssignmentGet`, `AgentAssignmentSet`, `AgentAssignmentChanged`.

- [ ] Write failing tests for snapshot revision ordering, account/model compatibility and distinct `unavailable`/`exhausted`/`capacity` states.
- [ ] Run `npm test -- tests/unit/provider-state.test.ts`; confirm failure because contracts/helpers are absent.
- [ ] Add strict types and pure helpers `isAssignmentCompatible()` and `classifyProviderError()`.
- [ ] Add IPC channel names and compatibility aliases without changing existing callers.
- [ ] Run the focused test and `npm run typecheck`; both must pass.
- [ ] Commit `feat: define canonical provider state contracts`.

### Task 2: Add versioned assignment persistence and migration

**Files:**
- Create: `src/main/agent/assignments.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/index.ts`
- Test: `tests/unit/agent-assignments.test.ts`

**Interfaces:**
- `AssignmentStore.load(): Record<string, AgentAssignment>`
- `AssignmentStore.set(assignment): AgentAssignment`
- `AssignmentStore.migrate(settings, workspaceAgents): MigrationResult`

- [ ] Write failing tests for Settings save/reopen preserving exact provider/account/model/speed and for invalid accounts becoming `needs-review` without selecting `models[0]`.
- [ ] Run `npm test -- tests/unit/agent-assignments.test.ts`; verify expected failures.
- [ ] Implement versioned JSON persistence under app user data, atomic temp-file writes, and migration from `bs.json` plus workspace agent model fields.
- [ ] Update `BsAgentManager.getAgentAssignment()` and `setModel`/`setAccount`/`setSpeed` to use `AssignmentStore` and increment `revision`.
- [ ] Initialize assignments before workspace agent registration and expose assignment IPC handlers.
- [ ] Run focused tests, `npm run typecheck`, and `git diff --check`.
- [ ] Commit `feat: persist canonical agent assignments`.

### Task 3: Refactor provider adapters around runtime and usage boundaries

**Files:**
- Modify: `src/main/providers/types.ts`
- Modify: `src/main/providers/registry.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/agent/llm.ts`
- Test: `tests/unit/provider-adapter-contract.test.ts`

**Interfaces:**
- `ProviderAdapter.definition()`
- `ProviderAdapter.connect()`
- `ProviderAdapter.refreshAccount()`
- `ProviderAdapter.listModels()`
- `ProviderAdapter.createRuntime()`
- `ProviderAdapter.fetchUsage?()`

- [ ] Add failing contract tests proving an OAuth account creates a provider-owned runtime and never calls the OpenAI fallback.
- [ ] Run the test and capture the current failure for Antigravity/OpenAI fallback.
- [ ] Implement adapter contracts and registry methods; keep existing API-key adapters working through a compatibility wrapper.
- [ ] Move Antigravity Cloud Code streaming client into its adapter, including sanitized tool schemas, OAuth bearer headers, SSE parsing and classified errors.
- [ ] Move OpenAI Codex headers and API-key runtime into the OpenAI adapter.
- [ ] Remove provider-name transport branches from `BsAgentManager`; resolve an account, model and adapter, then call `adapter.createRuntime()`.
- [ ] Run adapter tests plus existing `tests/unit/antigravity-runtime-guard.test.ts` and `npm run typecheck`.
- [ ] Commit `refactor: isolate provider runtime adapters`.

### Task 4: Implement provider snapshot service and refresh lifecycle

**Files:**
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/shared/provider-state.ts`
- Test: `tests/unit/provider-snapshot.test.ts`

**Interfaces:**
- `ProviderManager.getSnapshot(): ProviderSnapshot`
- `ProviderManager.refreshAccount(providerId, accountId): Promise<ProviderSnapshot>`
- `ProviderManager.onSnapshotChanged(listener)`

- [ ] Write failing tests for snapshot revision increments after account connect, model refresh, activate/deactivate and usage refresh.
- [ ] Implement a single snapshot builder joining registry definitions, account store, model metadata and usage state.
- [ ] Refresh account token/profile/models before workspace agent initialization; persist `updatedAt` and `lastError` without deleting prior valid models.
- [ ] Register centralized `ProviderSnapshotGet` and `ProviderSnapshotChanged` IPC handlers.
- [ ] Map 429 `RESOURCE_EXHAUSTED`, 503 capacity, 401/403 auth and unavailable usage into explicit state fields.
- [ ] Run focused tests and `npm run typecheck`.
- [ ] Commit `feat: add versioned provider snapshots`.

### Task 5: Rebuild Agents settings around explicit assignments

**Files:**
- Modify: `src/renderer/src/components/settings/AgentsTab.tsx`
- Modify: `src/renderer/src/components/settings/SettingsDialog.tsx`
- Test: `tests/unit/renderer-agent-assignment.test.tsx`

**Interfaces:**
- Consume `ProviderSnapshotGet` and `AgentAssignmentSet`.
- Emit one assignment mutation containing `providerId`, `accountId`, `modelId`, `speed`.

- [ ] Write failing renderer tests for changing model, saving, closing and reopening while preserving the selected model.
- [ ] Replace derived `effectiveProviders` model arrays with snapshot account/model refs.
- [ ] Make provider change explicitly clear incompatible account/model; make account change preserve a compatible model and otherwise show validation.
- [ ] Save through assignment IPC and update the local row only from the returned canonical assignment.
- [ ] Add disabled/error states for accounts and models rather than silently choosing the first model.
- [ ] Run renderer tests, `npm run typecheck`, and existing Agents tests.
- [ ] Commit `feat: persist exact agent provider assignments in settings`.

### Task 6: Rebuild Providers tab as a Cockpit-style account dashboard

**Files:**
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: relevant provider/settings CSS module or stylesheet
- Test: `tests/unit/provider-dashboard.test.tsx`

**Interfaces:**
- Consume `ProviderSnapshot` and provider connection method descriptors.
- Invoke connect, refresh, activate, deactivate, reconnect and remove through existing centralized API methods.

- [ ] Write failing tests for grouped provider cards, method picker flow and separate usage-unavailable vs exhausted states.
- [ ] Implement provider → method picker → connection modal, preserving OAuth/API/import fields per capability.
- [ ] Render one vertical account card with identity, auth mode, plan, models, state, refresh timestamp and lifecycle actions.
- [ ] Show staged refresh results: token/profile, models and usage independently.
- [ ] Add accessible labels and keyboard-safe modal controls.
- [ ] Run dashboard tests and typecheck.
- [ ] Commit `feat: rebuild provider settings dashboard`.

### Task 7: Make chat quota cards snapshot-driven and resilient

**Files:**
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`
- Test: `tests/unit/quota-snapshot.test.tsx`

**Interfaces:**
- Consume `ProviderSnapshotChanged` and `AgentAssignmentChanged`.
- Render `QuotaCardViewModel` built from one snapshot revision.

- [ ] Write failing tests for immediate model update after assignment change, multiple models on one account, and no stale card after agent switch.
- [ ] Remove assignment fetching keyed only by `agentKey`; subscribe to assignment/snapshot events and discard older revisions.
- [ ] Group by account while listing every model used in the session and current speed per agent.
- [ ] Render `Ready`, `Usage unavailable`, `Quota exhausted`, `Model capacity exhausted`, `Cooldown` and `Auth error` variants.
- [ ] Include retry-after/reset countdown and prevent automatic retries during cooldown.
- [ ] Run focused quota tests and full renderer typecheck.
- [ ] Commit `fix: make quota cards snapshot driven`.

### Task 8: Antigravity quota and model discovery

**Files:**
- Modify: `src/main/providers/adapters/antigravity.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/renderer/src/components/quota/quota-view.ts`
- Test: `tests/unit/antigravity-usage.test.ts`

**Interfaces:**
- `AntigravityAdapter.fetchUsage(account)` returns per-model remaining fraction, reset time, plan and account identity when Cloud Code provides them.

- [ ] Write failing tests for parsing `fetchAvailableModels` quota metadata and mapping 429 reset/cooldown details.
- [ ] Implement Cloud Code model discovery as account data, preserving server model IDs and display names.
- [ ] Implement usage refresh against the provider usage endpoint with token refresh on 401/403.
- [ ] Persist usage snapshots and emit provider snapshot changes without replacing model data on usage failure.
- [ ] Run usage tests and typecheck.
- [ ] Commit `feat: add Antigravity usage and quota adapter`.

### Task 9: Migration, end-to-end verification and cleanup

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/connections/store.ts`
- Modify: `docs/changelog-format.md` or release changelog location
- Test: `tests/integration/provider-agent-chat.test.ts`

- [ ] Write integration tests covering OAuth account → model refresh → assignment save → workspace restart → chat runtime using mocked Cloud Code/OpenAI endpoints.
- [ ] Run `npm test` and fix regressions without weakening assertions.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Run `git diff --check` and inspect migration backup behavior.
- [ ] Verify manually: model survives Settings reopen, quota card updates immediately, 429 displays exhausted/cooldown, and Antigravity token never reaches OpenAI endpoint.
- [ ] Update changelog and document migration/recovery steps.
- [ ] Commit `test: verify cockpit provider architecture end to end`.

## Execution checkpoints

- Checkpoint A after Tasks 1–2: assignments persist exactly and all existing provider tests pass.
- Checkpoint B after Tasks 3–4: adapter runtime and provider snapshot contracts are stable before UI replacement.
- Checkpoint C after Tasks 5–7: Settings, chat and quota consume one canonical state source.
- Checkpoint D after Tasks 8–9: Antigravity usage, migration and full regression verification complete.

## Verification commands

```powershell
npm test -- tests/unit/provider-state.test.ts tests/unit/agent-assignments.test.ts tests/unit/provider-snapshot.test.ts
npm test -- tests/unit/provider-adapter-contract.test.ts tests/unit/antigravity-runtime-guard.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```
