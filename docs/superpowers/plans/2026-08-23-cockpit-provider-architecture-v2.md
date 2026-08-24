# Cockpit-style Provider Architecture v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Do not mark a task complete without satisfying every Definition of Done item in that task.

**Goal:** Replace the legacy provider/account/model flow with a verifiable Cockpit-style system whose persistence, UI, runtime and quota state are backed by one canonical snapshot.

**Spec:** `docs/superpowers/specs/2026-08-23-cockpit-provider-architecture-design.md`

**Audit:** `docs/superpowers/audits/2026-08-23-cockpit-provider-implementation-audit.md`

## Execution status — completed 2026-08-24

- Tasks 1–9 and their automated acceptance suites are complete.
- The user verified three ChatGPT OAuth accounts and the connected Antigravity account in the running Electron app after the final routing and Agent-list fixes.
- Evidence: `docs/evidence/2026-08-23-provider-architecture-manual-verification.md` and `docs/evidence/2026-08-24-shared-session-provider-chat-verification.md`.
- Release baseline: BS Coding `1.0.0`.

## Non-negotiable execution rules

1. A task is `in_progress` until its tests, typecheck, diff review and required UI evidence are complete.
2. “File changed” is not evidence of feature completion. Every task must have a failing test or explicit UI reproduction before implementation and a passing test/evidence artifact after implementation.
3. No task may be marked complete because `npm test` passes; the new acceptance test for that task must pass.
4. No silent fallback from an invalid account/model to the first model. The UI must show `needs-review` and require an explicit choice.
5. Every provider/account/model/usage mutation must increment one monotonic snapshot revision and emit one complete snapshot event.
6. Every phase ends with a checkpoint report listing changed files, test names, command output, and remaining gaps.
7. The final phase requires manual verification in the running app and a saved evidence note; automated tests alone are insufficient.

## Phase 1 — Canonical contracts and migration (Tasks 1–3)

### Task 1: Complete shared provider state and functional IPC

Required outputs:

- `ProviderDefinition`, `ProviderAccountSnapshot`, `ProviderModelRef`, `ProviderUsageSnapshot`, `AgentAssignment`, `ProviderSnapshot` match the spec without legacy-string substitution.
- Functional `ProviderSnapshotGet`, `ProviderAccountRefresh`, `AgentAssignmentGet`, `AgentAssignmentSet`, `ProviderSnapshotChanged`, and `AgentAssignmentChanged` APIs in shared types, preload and main handlers.
- Renderer helper rejects snapshots with a revision lower than the current revision.

Required tests:

- `tests/unit/provider-state.test.ts`: revision ordering, compatibility, error classification.
- `tests/unit/ipc-provider-state.test.ts`: preload/main channel contract shape.

Definition of Done:

- Both new test files pass.
- `npm run typecheck` passes.
- `git diff --stat` lists shared types, preload, main handlers and tests.
- No task completion without a test proving revision rejection.

### Task 2: Implement assignment store migration and canonical mutation

Required outputs:

- `AssignmentStore.migrate()` reads legacy `bs.json` and workspace agents, writes a version marker and atomic backup.
- `AgentAssignmentSet` validates provider/account/model before persistence.
- Invalid references persist as `needs-review`; no first-model fallback.
- Settings save and model picker both use the same mutation path.

Required tests:

- `tests/unit/agent-assignments.test.ts`: migration, atomic backup, exact round trip, invalid references.
- `tests/integration/assignment-reopen.test.ts`: save → close → reopen → restart.

Definition of Done:

- Integration test proves exact model ID survives a process/workspace restart.
- Test asserts invalid model remains visible as `needs-review`.
- Migration backup file is verified on disk.

### Task 3: Finish provider adapter boundary

Required outputs:

- `ProviderAdapter` exposes `definition`, `connect`, `refreshAccount`, `listModels`, `createRuntime`, `fetchUsage`.
- OpenAI and Antigravity both implement the same contract.
- `BsAgentManager` contains no provider-specific OAuth/header branches.
- Runtime tool-call continuation is implemented for Antigravity or explicitly marked unsupported with a test and UI state.

Required tests:

- `tests/unit/provider-adapter-contract.test.ts` for OpenAI API key, OpenAI OAuth and Antigravity OAuth.
- `tests/unit/antigravity-runtime.test.ts` for request, SSE, error and tool continuation.

Definition of Done:

- A spy proves Antigravity never calls OpenAI endpoint.
- A spy proves OpenAI OAuth still sends Codex headers.
- All provider-specific behavior is located under provider adapters/connections.

## Phase 2 — Snapshot lifecycle and UI (Tasks 4–6)

### Task 4: Make provider snapshot authoritative

Required outputs:

- Snapshot contains definitions, account metadata, model metadata, usage, errors and all assignments.
- Revision increments only on mutation and is emitted exactly once per mutation.
- Account refresh has independent stages: credentials/profile, models, usage.

Required tests:

- `tests/unit/provider-snapshot.test.ts` covers every mutation and revision.
- `tests/integration/provider-refresh.test.ts` covers partial stage failure without losing valid models.

Definition of Done:

- No renderer component reads `listProviderAccounts()` directly for dashboard state.
- Snapshot assignments are non-empty for configured agents.

### Task 5: Rebuild Agents settings

Required outputs:

- Agents tab consumes only `ProviderSnapshot` and canonical assignment IPC.
- Provider/account/model/speed are explicit controls.
- Exact selected model remains after close/reopen and restart.
- Incompatible saved assignments show `needs-review`.

Required tests/evidence:

- `tests/unit/renderer-agent-assignment.test.tsx` with save/reopen flow.
- Playwright or recorded manual evidence showing selected model before/after reopen.

Definition of Done:

- `AgentsTab.tsx` no longer builds `effectiveProviders` from legacy arrays.
- The assignment mutation response is the only source used to update the row.

### Task 6: Rebuild Providers dashboard

Required outputs:

- Provider groups and account cards come from snapshot definitions/accounts.
- Add provider flow is provider → method → modal.
- OAuth/API/import methods are rendered from descriptors, not provider-name conditionals.
- Actions: activate, deactivate, refresh, reconnect, remove.
- Stage-level refresh status is visible.

Required tests/evidence:

- `tests/unit/provider-dashboard.test.tsx` for grouping and method picker.
- Manual evidence for at least OpenAI OAuth, Antigravity OAuth and one API-key provider.

Definition of Done:

- Providers tab has no independent account/usage source of truth.
- A provider can add an account without editing legacy `BsSettings.providers` manually.

## Phase 3 — Quota, Antigravity and final proof (Tasks 7–9)

### Task 7: Snapshot-driven quota cards

Required outputs:

- Right panel consumes snapshot + assignment events only.
- Stale revisions are discarded.
- One account card lists every session model and every assigned agent.
- UI states: ready, unavailable, quota exhausted, capacity exhausted, cooldown, auth error.

Required tests/evidence:

- `tests/unit/quota-snapshot.test.tsx` for all states and model changes.
- Manual evidence after changing model and agent.

Definition of Done:

- No direct assignment polling remains in `RightPanelQuota`.
- No hardcoded model displayed by quota card.

### Task 8: Antigravity discovery, usage and resilience

Required outputs:

- Server model IDs/capabilities are persisted per account.
- `fetchAvailableModels` usage parser has dedicated tests.
- 401/403 refreshes token once; 429 stores retry/reset data; 503 capacity is distinct.
- Cloud Code tool schema and multi-turn tool response handling are tested.

Required tests:

- `tests/unit/antigravity-usage.test.ts`.
- `tests/unit/antigravity-error-classification.test.ts`.
- `tests/integration/provider-agent-chat.test.ts` with mocked Cloud Code SSE.

Definition of Done:

- Quota card shows real mocked remaining/reset values.
- A 429 test proves automatic retry is disabled until cooldown.

### Task 9: Final migration and evidence gate

Required outputs:

- Full OAuth → account → refresh → assignment → workspace restart → chat integration test.
- Migration/recovery documentation and changelog entry.
- Manual evidence note with screenshots or exact reproduction steps/results.

Definition of Done:

- `npm test`, `npm run typecheck`, `npm run build`, and required integration tests pass.
- Evidence note confirms Settings reopen, quota update, provider add flow and 429 state.
- Only then may the plan be marked complete.
