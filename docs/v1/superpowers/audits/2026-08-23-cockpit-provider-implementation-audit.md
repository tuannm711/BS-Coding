# Cockpit Provider Architecture — Implementation Audit

Date: 2026-08-23

## Executive finding

The implementation is not complete. The repository contains useful foundations, but the previous completion report overstated progress. The final renderer commit changed only three files with 10 additions and 6 deletions, which is not evidence of a full Cockpit-style Providers/Agents/Quota redesign.

## Evidence reviewed

- Approved spec: `docs/superpowers/specs/2026-08-23-cockpit-provider-architecture-design.md`
- Previous plan: `docs/superpowers/plans/2026-08-23-cockpit-provider-architecture.md`
- Current source tree and tests.
- Recent commit stats with `git log --stat`.
- Full regression: 105 test files / 744 tests passed; this proves regression safety, not feature completeness.

## Status by task

### Task 1 — Canonical state and IPC contracts: PARTIAL

Implemented:

- `src/shared/provider-state.ts` exists.
- Basic compatibility and error classification helpers exist.
- Snapshot/assignment channel constants exist.

Missing:

- The spec types were not implemented as specified; `ProviderDefinitionSnapshot` is a partial substitute.
- No revision ordering helper or renderer-side stale revision rejection.
- `AgentAssignmentGet` / `AgentAssignmentSet` are not exposed as functional IPC APIs; only channel constants were added.
- `ProviderAccountRefresh` is missing.
- Shared types still carry legacy string model arrays as the primary contract.
- No contract test verifies all mutations emit a revisioned event.

### Task 2 — Assignment persistence and migration: PARTIAL

Implemented:

- `assignments.json`-style persistence exists.
- `setModel`, `setAccount`, and `setSpeed` write assignments.
- Resolver can consult a persisted assignment.

Missing or incorrect:

- No `migrate(settings, workspaceAgents)` implementation.
- No backup/version migration marker for existing users.
- File writes are not atomic temp-file writes.
- No canonical `AgentAssignmentSet` IPC mutation path.
- Invalid account/model state is not persisted as `needs-review`; resolver can still fall back to another model.
- No end-to-end test proves Settings save → close → reopen → workspace restart preserves the exact model.

### Task 3 — Provider adapter boundary: PARTIAL

Implemented:

- A provider runtime callback and Antigravity Cloud Code client exist.

Missing:

- `ProviderAdapter` still uses the legacy `capability` shape; `definition`, `refreshAccount`, and standardized runtime/usage contracts are absent.
- OpenAI runtime/model/usage behavior is not moved behind the new adapter contract.
- `BsAgentManager` still contains provider-specific credential/header logic.
- No adapter contract test verifies every OAuth provider avoids the generic OpenAI path.
- Tool-call continuation and provider runtime error classification are incomplete.

### Task 4 — Provider snapshot and lifecycle: PARTIAL

Implemented:

- A snapshot builder and `ProviderSnapshotGet`/change wiring exist.

Missing or incorrect:

- Snapshot `assignments` is always an empty array.
- Revision increments when `getSnapshot()` is called, not only when state mutates; this is not a reliable mutation revision.
- Usage/model/account mutations do not consistently emit snapshot changes.
- `ProviderManager.refreshAccount()` and staged refresh results do not exist.
- Snapshot account model metadata is reconstructed from strings and loses server capabilities/discovery source.
- No test covers connect, refresh, activate/deactivate and usage mutations.

### Task 5 — Agents settings: NOT IMPLEMENTED (only wiring)

Missing:

- `AgentsTab` still derives `effectiveProviders` from legacy provider arrays.
- It does not consume account-scoped model references from `ProviderSnapshot`.
- It does not call `AgentAssignmentSet`; it edits a Settings draft and relies on `saveSettings` side effects.
- No explicit validation state for a saved model no longer offered.
- No confirmation flow for incompatible provider/account changes.
- No renderer test exists for exact model persistence after close/reopen.

### Task 6 — Cockpit-style Providers dashboard: NOT IMPLEMENTED

Missing:

- `ProvidersTab` remains the old implementation with local `accounts` and `usageByAccount` state.
- No provider grouping model driven by snapshot definitions.
- No provider → method picker → connection modal flow based on capability descriptors.
- No staged refresh status for token/profile, model discovery and usage.
- No reconnect action.
- No dashboard test.
- Existing card reuse does not equal a Cockpit-style provider dashboard.

### Task 7 — Snapshot-driven quota cards: PARTIAL

Implemented:

- Assignment change events trigger a refresh.
- Provider snapshot is read by Providers/Agents in limited places.

Missing:

- `RightPanelQuota` still keeps a local `states` map and calls `getAgentAssignment()` directly.
- It does not consume a full provider snapshot or reject stale revisions.
- It groups by account but does not reliably list all models used by that account in the session.
- No explicit UI states for `Quota exhausted`, `Model capacity exhausted`, `Cooldown`, or `Auth error`.
- No quota snapshot renderer test.

### Task 8 — Antigravity model/quota: PARTIAL

Implemented:

- Cloud Code runtime request and basic `fetchAvailableModels` usage request exist.
- Static current model catalog exists.

Missing or incorrect:

- Model discovery still returns a static list instead of preserving the account's server-provided model IDs/capabilities.
- Usage parsing has no dedicated unit test.
- 401/403 token refresh is not implemented in usage refresh.
- 429 reset/cooldown metadata is not parsed or persisted.
- Quota source and runtime error state are not unified in the provider snapshot.
- Tool calls and multi-turn function responses are not fully implemented.

### Task 9 — Migration and end-to-end verification: NOT IMPLEMENTED

Missing:

- No migration integration test.
- No OAuth → account → model refresh → assignment → workspace restart → chat integration test.
- No manual evidence artifact for Settings reopen and quota update.
- No changelog/recovery documentation for migration.
- `npm test` and build passing are regression evidence only; they do not prove the new acceptance criteria.

## Risk assessment

The largest risk is declaring completion from green legacy tests. The existing tests mostly validate old contracts and do not exercise the new snapshot, assignment IPC, dashboard UX, migration, or live provider flow. The next plan must make acceptance tests mandatory before implementation claims.

