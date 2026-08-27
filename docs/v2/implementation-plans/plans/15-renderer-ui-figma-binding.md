# Renderer V2 UI and Figma Prototype Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the locked Figma Make UX as the V2 renderer shell backed by real V2 projections/commands, not hard-coded workflow strings.

**Architecture:** Build V2 screens under `src/renderer/src/v2`; keep legacy renderer available behind cutover flag until feature parity gates pass. UI reads DTO projections only and calls `window.bs.v2` commands.

**Tech Stack:** Electron 41.7.1, React 19.2.8, TypeScript 7.0.2, AI SDK 6.x, Zod 4.x, Vitest 4.x, Playwright 1.62.x, MCP SDK 1.30.x, node-pty, Git CLI, SQLite/WAL.

**Spec:** ../architecture/02-components/14-ui-application-binding.md + ../architecture/03-other/11-requirement-traceability.md

**Approved UX:** https://www.figma.com/make/bULXvPib4GPwrJruE4P53V/Design-Markdown-Specifications?t=tgKzhM6dSqlbpHtC-1

**Repository baseline:** `master@8160ce8d2b61da2253e906843978ee5014c97467` (BS Coding 1.3.1). Rebase/re-measure paths if the branch has moved before executing.

## Global Constraints

- V2 is a clean core rebuild beside legacy code under `src/main/v2`, `src/shared/v2`, and `src/renderer/src/v2` until cutover.
- Domain code MUST NOT import Electron, provider SDKs, filesystem, SQLite, Git, or renderer modules.
- Provider-specific SDK/native shapes MUST terminate at adapter boundaries and MUST NOT enter domain/shared contracts.
- Every external boundary is runtime-validated with Zod.
- No real model/provider calls in the normal automated test suite; use deterministic fakes/recorded fixtures.
- Every consequential state transition is explicit, persisted, auditable, and unit-tested.
- Narrated tool prose is never interpreted as an executable tool call.
- WorkSession continuity is independent of provider-native conversation identity; runtime changes create RuntimeEpochs.
- Parallel write tasks use isolated Git worktrees before integration.
- Secrets remain in the main process/vault and never cross preload to renderer.
- `npm run typecheck` and the plan-specific tests MUST be green before each plan is considered complete.

---
## Dependency / Execution Position

Requires Plan 14 and backend projections. May be developed in parallel with Plans 16-19 once IPC DTOs are stable.

## File Structure Locked by This Plan

The files listed inside each task are the intended V2 boundaries. Do not move responsibilities back into `src/main/bs-agent-manager.ts` or another legacy god object.

### Task 1: Create V2 shell/navigation/design tokens

**Files:**
- Create: `src/renderer/src/v2/app/V2App.tsx`
- Create: `src/renderer/src/v2/app/navigation.ts`
- Create: `src/renderer/src/v2/styles/tokens.css`
- Modify: `src/renderer/src/App.tsx` — V2 cutover branch only
- Test: `tests/unit/v2/renderer-navigation.test.tsx`

**Interfaces:**
- Consumes: Figma locked nav and current V2 bootstrap flag.
- Produces: Exactly Home, Projects, Work, Agents, Settings primary navigation; States remains dev-only.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('has exactly five production nav items', () => { expect(['Home','Projects','Work','Agents','Settings']).toHaveLength(5) })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/renderer-navigation.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const V2_NAV=['Home','Projects','Work','Agents','Settings'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/renderer-navigation.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): add locked application shell"
```

### Task 2: Implement Home and Project workspace screens

**Files:**
- Create: `src/renderer/src/v2/screens/HomeScreen.tsx`
- Create: `src/renderer/src/v2/screens/ProjectScreen.tsx`
- Create: `src/renderer/src/v2/features/project/WorkSessionsView.tsx`
- Create: `src/renderer/src/v2/features/project/FilesView.tsx`
- Create: `src/renderer/src/v2/features/project/GitView.tsx`
- Create: `src/renderer/src/v2/features/project/ProjectAgentsView.tsx`
- Create: `src/renderer/src/v2/features/project/SkillsView.tsx`
- Create: `src/renderer/src/v2/features/project/McpView.tsx`
- Create: `src/renderer/src/v2/features/project/ProjectSettingsView.tsx`
- Test: `tests/unit/v2/project-screens.test.tsx`

**Interfaces:**
- Consumes: V2 project/workSession/provider DTO queries through preload.
- Produces: Figma-equivalent operational Home and project tabs with loading/empty/error states.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('renders project tabs from DTO state', () => {
  expect(PROJECT_TABS).toEqual(['Overview','Work Sessions','Files','Git','Agents','Skills','MCP','Project Settings'])
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/project-screens.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const PROJECT_TABS=['Overview','Work Sessions','Files','Git','Agents','Skills','MCP','Project Settings'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/project-screens.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement home and project workspace"
```

### Task 3: Implement Work Session tabs and lifecycle controls

**Files:**
- Create: `src/renderer/src/v2/screens/WorkSessionScreen.tsx`
- Create: `src/renderer/src/v2/features/work/ConversationView.tsx`
- Create: `src/renderer/src/v2/features/work/PlanView.tsx`
- Create: `src/renderer/src/v2/features/work/TasksView.tsx`
- Create: `src/renderer/src/v2/features/work/ExecutionView.tsx`
- Create: `src/renderer/src/v2/features/work/ChangesView.tsx`
- Create: `src/renderer/src/v2/features/work/ReviewView.tsx`
- Create: `src/renderer/src/v2/features/work/RuntimeHistory.tsx`
- Test: `tests/unit/v2/work-session-screen.test.tsx`

**Interfaces:**
- Consumes: WorkSession projection and commands pause/resume/cancel/switchRuntime/approvePlan.
- Produces: Locked tabs and actual lifecycle state, RuntimeEpoch events, protocol degradation banner, rework lifecycle projection.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('shows resume while session projection is PAUSED', () => {
  expect(sessionPrimaryAction('PAUSED')).toBe('Resume')
  expect(sessionPrimaryAction('EXECUTING')).toBe('Pause')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/work-session-screen.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const WORK_TABS=['Conversation','Plan','Tasks','Execution','Changes','Review'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/work-session-screen.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement work session experience"
```

### Task 4: Implement Agents and Settings/Providers

**Files:**
- Create: `src/renderer/src/v2/screens/AgentsScreen.tsx`
- Create: `src/renderer/src/v2/screens/SettingsScreen.tsx`
- Create: `src/renderer/src/v2/features/settings/ProvidersPanel.tsx`
- Create: `src/renderer/src/v2/features/settings/panels.tsx`
- Test: `tests/unit/v2/agents-settings.test.tsx`

**Interfaces:**
- Consumes: Agent/provider/settings DTOs and commands.
- Produces: Agent add/edit policies; multi-account provider health, capability probes, connect/disable/refresh interactions; global/project scope separation.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest'
it('does not show project agent binding under global settings', () => {
  expect(GLOBAL_SETTINGS).not.toContain('Agents'); expect(GLOBAL_SETTINGS).toContain('Providers')
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/unit/v2/agents-settings.test.tsx`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const GLOBAL_SETTINGS=['Application','Appearance','Providers','Security','Default Permissions','Updates','Remote Control'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx vitest run tests/unit/v2/agents-settings.test.tsx`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "feat(v2-ui): implement agents and global settings"
```

### Task 5: Implement functional bottom panel and E2E prototype paths

**Files:**
- Create: `src/renderer/src/v2/components/BottomPanel.tsx`
- Create: `tests/e2e/v2-core-flow.spec.ts`
- Create: `tests/e2e/v2-runtime-switch.spec.ts`

**Interfaces:**
- Consumes: Terminal/test/problem/log/output projections and V2 commands.
- Produces: Distinct panel content and E2E flows matching approved prototype: project → work → runtime switch → review/rework → complete.

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from '@playwright/test'
test('v2 main flow exposes work tabs', async ({ page }) => { await expect(page.getByText('Tasks')).toBeVisible() })
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`  
Expected: FAIL because the new V2 contract/behavior does not exist yet.

- [ ] **Step 3: Implement the minimal production code**

```ts
export const BOTTOM_TABS=['Terminal','Tests','Problems','Logs','Output'] as const
```

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`  
Expected: PASS with no snapshot or timing-only assertions.

- [ ] **Final step: Commit the independently testable task**

```bash
git add -A
git commit -m "test(v2-ui): cover locked prototype flows"
```

## Plan Completion Gate

Run `npm run typecheck && npx vitest run tests/unit/v2/*screen*.test.tsx tests/unit/v2/agents-settings.test.tsx && npx playwright test tests/e2e/v2-core-flow.spec.ts tests/e2e/v2-runtime-switch.spec.ts`.

## Acceptance / Traceability

- `AC-CORE-01`, `AC-UX-01..04`.
- UI state comes from projections, not hard-coded demo lifecycle.
- Runtime epoch switch is explicit in Conversation and history.
- Terminal is supporting bottom panel, never primary product navigation.
