# Quota Control Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved quota control-room card with account metadata, Standard/Fast per agent, remaining quota progress bars, reset timers, and reset-bounded usage metrics.

**Architecture:** Keep provider quota fetching in the main process and expose normalized account-level data through the existing provider usage event. Persist speed on each native agent, carry it through the agent manager into LLM stream options, and emit `service_tier: priority` only for Fast OpenAI/Codex requests. Build one reusable quota view model/card for Providers and the chat right panel, with local session usage overlaid where available.

**Tech Stack:** Electron 41, React 19, TypeScript strict, Vitest, existing IPC contract, existing CSS theme tokens and Lucide icons.

---

### Task 1: Extend shared quota and agent contracts

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/unit/ipc-contract.test.ts`

- [ ] **Step 1: Write failing contract assertions**

Add assertions for `AgentSetSpeed`, `AgentApi.setAgentSpeed`, `AgentConfig.speed`, `AgentSettings.speed`, `AgentModelAssignment.speed`, and the quota fields `accountLabel`, `accountType`, `planName`, `secondaryResetAt`, `tokensInput`, `tokensOutput`, and `estimatedBilled`.

- [ ] **Step 2: Run the focused contract test**

Run: `npx vitest run tests/unit/ipc-contract.test.ts`

Expected: FAIL because the channel, API method, and fields are not yet defined.

- [ ] **Step 3: Implement the shared contract**

Add `AgentSpeed = 'standard' | 'fast'`, optional `speed` fields to agent config/settings/assignment, add `AgentSetSpeed: 'agent:set-speed'`, add `setAgentSpeed(agentId, speed)` to `AgentApi`, and add the quota metadata/usage fields from the approved spec to `ProviderUsage`.

- [ ] **Step 4: Expose the preload method**

Add the `ipcRenderer.invoke(Channels.AgentSetSpeed, agentId, speed)` bridge next to the existing mode/variant/model methods.

- [ ] **Step 5: Run the focused contract test**

Run: `npx vitest run tests/unit/ipc-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/preload/index.ts tests/unit/ipc-contract.test.ts
git commit -m "feat: add agent speed and quota metadata contracts"
```

### Task 2: Persist and route per-agent speed

**Files:**
- Modify: `src/main/agent/config.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/agent/loop.ts`
- Modify: `src/main/agent/llm.ts`
- Modify: `src/main/agent/openai-responses.ts`
- Test: `tests/unit/agent-config.test.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`
- Test: `tests/unit/openai-responses.test.ts`

- [ ] **Step 1: Write failing persistence and payload tests**

Test that `settingsToConfig`/`configToSettings` preserve `speed`, `setSpeed` changes the assignment returned by the manager, and an OpenAI Responses request with `serviceTier: 'priority'` contains `service_tier: 'priority'` while Standard omits it.

- [ ] **Step 2: Run the focused tests**

Run: `npx vitest run tests/unit/agent-config.test.ts tests/unit/bs-agent-manager.test.ts tests/unit/openai-responses.test.ts`

Expected: FAIL on missing speed persistence, manager method, and request field.

- [ ] **Step 3: Implement persistence and manager state**

Normalize missing speed to `standard`, preserve it in config/settings conversion, add `setSpeed(agentId, speed)` that resets the runner/resolved cache and updates the live agent, and include speed in `getAgentAssignment`.

- [ ] **Step 4: Wire the IPC handler**

Register `Channels.AgentSetSpeed` in `src/main/index.ts` and call the manager method.

- [ ] **Step 5: Carry speed to the LLM request**

Add `serviceTier?: 'priority'` to `LlmStreamOptions`, pass it from the agent loop only when the resolved agent speed is `fast`, and add `service_tier: 'priority'` to the OpenAI Responses body only when present. Non-OpenAI clients ignore the field.

- [ ] **Step 6: Run the focused tests**

Run: `npx vitest run tests/unit/agent-config.test.ts tests/unit/bs-agent-manager.test.ts tests/unit/openai-responses.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/agent/config.ts src/main/bs-agent-manager.ts src/main/index.ts src/main/agent/loop.ts src/main/agent/llm.ts src/main/agent/openai-responses.ts tests/unit/agent-config.test.ts tests/unit/bs-agent-manager.test.ts tests/unit/openai-responses.test.ts
git commit -m "feat: support per-agent Codex speed tiers"
```

### Task 3: Normalize quota windows and reset-bounded usage

**Files:**
- Modify: `src/main/connections/usage.ts`
- Modify: `src/main/connections/manager.ts`
- Modify: `src/main/connections/store.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/unit/connections-usage.test.ts`

- [ ] **Step 1: Add failing parser tests**

Cover current `wham/usage` (`rate_limit`), legacy root/`rate_limits`, `reset_after_seconds`, plan expiry, missing fields, and conversion of used percentages to a UI-facing remaining percentage helper.

- [ ] **Step 2: Run the focused parser test**

Run: `npx vitest run tests/unit/connections-usage.test.ts`

Expected: FAIL for the new metadata and view-model behavior.

- [ ] **Step 3: Implement normalized fields**

Preserve current endpoint/header behavior, parse account plan metadata and both windows, record primary/secondary reset timestamps, and return server request/token values when provided. Keep unavailable responses explicit and retain cached usage on transient refresh failure.

- [ ] **Step 4: Add usage view-model helpers**

Create `src/renderer/src/components/quota/quota-view.ts` with pure functions for remaining percentage, countdown labels, expiry labels, and safe formatting. Return `—` for absent fields and clamp percentages to 0–100.

- [ ] **Step 5: Run parser tests**

Run: `npx vitest run tests/unit/connections-usage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/connections/usage.ts src/main/connections/manager.ts src/main/connections/store.ts src/renderer/src/components/quota/quota-view.ts tests/unit/connections-usage.test.ts
git commit -m "feat: normalize quota windows and usage metrics"
```

### Task 4: Build the reusable quota card UI

**Files:**
- Create: `src/renderer/src/components/quota/QuotaAccountCard.tsx`
- Create: `src/renderer/src/components/quota/quota-view.ts`
- Modify: `src/renderer/src/components/RightPanelQuota.tsx`
- Modify: `src/renderer/src/components/settings/ProvidersTab.tsx`
- Modify: `src/renderer/src/styles.css`
- Test: `tests/unit/quota-view.test.ts`

- [ ] **Step 1: Write failing view-model tests**

Test remaining progress values, reset countdowns, expiry labels, Standard/Fast labels, and safe `—` formatting.

- [ ] **Step 2: Run the focused view-model test**

Run: `npx vitest run tests/unit/quota-view.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure quota view model**

Implement the helper functions with deterministic `now` parameters so tests do not depend on wall-clock timing.

- [ ] **Step 4: Implement the account card**

Build the approved B layout using semantic sections: account identity/type, plan/expiry, per-agent speed segmented controls, 5-hour and weekly progress bars with visible percentages and ARIA attributes, reset labels, and a compact usage grid for requests, input, output, estimated billed, and last refresh. Use Lucide icons and existing theme variables.

- [ ] **Step 5: Integrate Providers and right panel**

Replace duplicated quota text with `QuotaAccountCard`. Providers renders all accounts; right panel groups active agents by account and passes each account's usage plus local session usage. Speed controls call `window.api.setAgentSpeed` and update the assignment state without clearing quota data.

- [ ] **Step 6: Add styles and responsive states**

Add dense dashboard spacing, progress bar states, segmented-control focus/selected/disabled states, stale/loading/error styles, and reduced-motion-safe transitions. Keep card readable in the existing narrow right panel.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/quota-view.test.ts tests/unit/ipc-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/quota src/renderer/src/components/RightPanelQuota.tsx src/renderer/src/components/settings/ProvidersTab.tsx src/renderer/src/styles.css tests/unit/quota-view.test.ts
git commit -m "feat: add quota control room cards"
```

### Task 5: Full verification and app handoff

**Files:**
- Verify: all files from Tasks 1–4

- [ ] **Step 1: Run the required checks**

Run: `npm run typecheck`, `npm test`, and `npm run build`.

- [ ] **Step 2: Run the existing E2E suite if settings/chat coverage is present**

Run: `npm run e2e` after the production build. Record any unrelated flaky test separately rather than claiming a full pass.

- [ ] **Step 3: Restart the Electron app**

Run: `npm run start` and verify Providers and chat right panel with the signed-in account.

- [ ] **Step 4: Validate acceptance criteria manually**

Confirm account identity/type, plan expiry, independent Standard/Fast changes for two agents, 5-hour and weekly remaining bars, both reset countdowns, requests/input/output/estimated billed values, refresh/error states, and no generic OpenAI models in the picker.

- [ ] **Step 5: Commit verification notes if needed**

Only commit code/docs changes; do not commit runtime quota cache or visual companion state.
