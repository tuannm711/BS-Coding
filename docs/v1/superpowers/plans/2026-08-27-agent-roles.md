# Agent Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** One coordinator per project that the file and the panel agree on, role
controls that can always be undone, and a fallback that borrows an account
rather than an identity.

**Architecture:** A handoff stops borrowing the serving agent's system prompt,
which removes the mode filter it was propping up; one atomic role change in the
main process replaces two IPC calls; the two icon buttons become one three-state
switch.

**Tech Stack:** TypeScript, vitest, React 19, Electron.

## Global Constraints

- Test baseline: **158 files, 1201 tests**. Report the count after each task.
- Roles are per **project** (`cwd`), decided by the owner. Not per session.
- No new field for the role. `mode === 'coordinate'` and `worker === false`
  already express all three states; a `role` enum beside `mode` is the second
  answer to one question the owner rejected once already.
- Do not tag, bump the version, or merge.
- `feat/fleet-surface` stays the only side branch.

## A decision this plan makes, which the spec left half-open

The spec says *"any agent with no role can serve any turn"*. Read strictly that
could mean candidates are **restricted to** role-less agents. This plan does not
restrict them.

Under the approved approach a handoff borrows only `llm` and `model`; the turn
keeps its own tools, prompt and identity, and the serving agent is not occupied
by it — only its credentials are used. So there is no reason left to exclude any
account. **The mode filter is removed and nothing replaces it.**

Role-less agents therefore become available as fallback without a rule saying
so, which is what the owner asked for and one fewer rule than saying it.

If the owner intended fallback to be *only* role-less agents, this is the step
to say so — it is a two-line filter, but it would mean a project with no
role-less agent has no fallback for anyone.

---

### Task 1: A handoff borrows the endpoint, not the identity

**Files:**
- Modify: `src/main/agent/loop.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('keeps the original agent as the identity after a handoff', async () => {
    // A handoff is another account answering this turn, not another agent
    // taking it over. The serving agent's instructions describe an agent that
    // is not doing this work.
    const { manager, llmSystems } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): quota' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    // The second request is the one served by the other account. It must still
    // carry the coordinator's own note, not the worker's build-mode prompt.
    expect(llmSystems[1]).toContain('coordinator')
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/bs-agent-manager.test.ts -t "identity after a handoff"
```

Expected: fails — the second request carries the serving agent's system prompt.
If it passes, stop: either the mode filter is still selecting a same-mode agent
(remove it first, Task 2) or the harness is not recording the second system.
Do not proceed on a green test here; that signature has already misled this
project twice.

- [ ] **Step 3: Implement**

`src/main/agent/loop.ts`, in the step that builds the stream:

```ts
        // Resolved per step, so something above can change who answers without
        // the loop learning what an agent is. Only who answers: the system
        // prompt stays the turn's own, because the serving agent's
        // instructions describe an agent that is not doing this work.
        const target = this.deps.currentTarget?.()
        const stream = (target?.llm ?? this.deps.llm).stream({
          model: target?.model ?? this.deps.model,
          system: this.deps.system + (this.deps.systemSuffix?.() ?? ''),
```

Leave `variantOptions` taking the target's: it is a property of the model being
called, not of the agent whose turn it is.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1202**. Commit as `fix: a handoff borrows the endpoint, not the identity`.

The body must record that `currentTarget().system` is now unused by the loop and
say why it is kept on the interface — `target()` is also what `candidateFor`
and the trace surface read.

---

### Task 2: Drop the mode filter, so a coordinator has a fallback again

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('gives a coordinator a fallback', async () => {
    // Exclusive coordination plus a same-mode filter left a coordinator with
    // no candidate at all: its quota ran out and the turn simply failed.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): quota' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
    expect(events.filter(event => event.type === 'error')).toEqual([])
  })

  it('falls back to an agent in another mode', async () => {
    // The filter rested on a claim that was false — a handoff never changed
    // the tool set — and with the prompt no longer borrowed there is nothing
    // left for it to protect.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): quota' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    manager.setMode('a3', 'plan')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
  })
```

Two existing tests assert the opposite and must be **replaced**, not left
failing: `does not hand a build turn to an agent in another mode` and
`does not hand a coordinator turn to a worker`. Their reason is recorded in
`docs/superpowers/specs/2026-08-26-coordinator-role-awareness-design.md`, which
Task 6 corrects.

- [ ] **Step 2: Run to confirm failure**

Expected: both new tests fail — no candidate is selected.

- [ ] **Step 3: Implement**

In `handoff`, delete the mode filter and its comment:

```ts
    const candidates = [...this.agents.values()]
      .filter(agent => agent.kind !== 'pty' && agent.cwd === this.agents.get(agentId)?.cwd)
      .flatMap(agent => { const c = this.candidateFor(agent.id); return c ? [c] : [] })
```

Remove the now-unused `const mode = this.modes.get(agentId) ?? 'build'`.

- [ ] **Step 4: Verify and commit**

Expected: **1202** (two added, two removed). Commit as
`feat: any account in the project can carry a refused turn`.

---

### Task 3: One atomic role change

**Files:**
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`,
  `src/main/bs-agent-manager.ts`, `tests/unit/ipc-contract.test.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

**Interfaces:**
- Produces: `setAgentRole(agentId: string, role: 'coordinator' | 'worker' | 'none'): Promise<void>`
- Replaces: `setAgentWorker`, which never shipped outside this branch.

- [ ] **Step 1: Write the failing tests**

```ts
  it('persists the demotion as well as the promotion', async () => {
    // setMode demoted the previous coordinator in memory only: the panel kept
    // both lit and a restart restored both from workspaces.json.
    const { manager } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    expect(manager.setMode('a3', 'coordinate')).toEqual(
      expect.arrayContaining(['a1', 'a3'])
    )
  })

  it('reports only the agent it changed when there was no other', async () => {
    const { manager } = await makeManager({ secondAgent: true })
    expect(manager.setMode('a1', 'coordinate')).toEqual(['a1'])
  })

  it('clears the worker flag when an agent takes the coordinator role', async () => {
    const { manager } = await makeManager({ secondAgent: true })
    manager.setWorker('a1', true)
    manager.setMode('a1', 'coordinate')
    expect(manager.listAgents().find(agent => agent.id === 'a1')?.worker).toBe(false)
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: `setMode` returns `void`.

- [ ] **Step 3: Implement in the manager**

`setMode` returns the ids it changed, demoting **before** promoting so a failure
between the two writes leaves no coordinator rather than two:

```ts
  // Returns every agent whose config changed, because exclusivity means one
  // press can change two — and persisting only the pressed one is what left
  // the panel showing two coordinators and the file agreeing with it.
  setMode(agentId: string, mode: AgentMode): string[] {
    const changed: string[] = []
    if (mode === 'coordinate') {
      const cwd = this.agents.get(agentId)?.cwd
      for (const other of [...this.agents.values()]) {
        if (other.id === agentId || other.cwd !== cwd) continue
        if ((this.modes.get(other.id) ?? 'build') === 'coordinate') {
          this.setMode(other.id, 'build')
          changed.push(other.id)
        }
      }
    }
    ...
    changed.push(agentId)
    return changed
  }
```

A coordinator is not assignable, so taking the role clears `worker`:

```ts
      agent.mode = mode
      if (mode === 'coordinate') agent.worker = false
```

- [ ] **Step 4: Add the role channel**

`Channels.AgentSetRole`, the `AgentApi` member, the preload implementation, the
main handler, and the stub in `ipc-contract.test.ts` in the same commit — that
suite went 24 members behind once.

In `MainApp`:

```ts
  setAgentRole(agentId: string, role: 'coordinator' | 'worker' | 'none'): void {
    const changed = this.bsAgent.setMode(agentId, role === 'coordinator' ? 'coordinate' : 'build')
    this.bsAgent.setWorker(agentId, role === 'worker')
    const ws = this.findWorkspaceByAgent(agentId)
    if (!ws) return
    // Every agent the change touched, not only the one pressed.
    for (const id of new Set([...changed, agentId])) {
      const config = this.bsAgent.listAgents().find(agent => agent.id === id)
      if (!config) continue
      const updated = this.workspaces.updateAgent(ws.projectPath, id, {
        mode: config.mode, worker: config.worker
      })
      this.pushAgentConfig(updated, id)
    }
  }
```

Delete `setAgentWorker` and `Channels.AgentSetWorker` with it.

- [ ] **Step 5: Verify and commit**

Expected: **1205**. Commit as `fix: persist and push every agent a role change touches`.

---

### Task 4: The role switch

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/components/fleet/fleet-model.ts`,
  `src/renderer/src/components/fleet/FleetPanel.tsx`,
  `src/renderer/src/components/RightPanel.tsx`,
  `src/renderer/src/App.tsx`
- Test: `tests/unit/fleet-panel.test.tsx`

**Interfaces:**
- Consumes: `setAgentRole` from Task 3.
- `FleetAgentRow` gains `role: 'coordinator' | 'worker' | 'none'`, replacing the
  `coordinator` and `worker` booleans — two booleans with an impossible
  combination is what let the UI show a state the manager could not hold.

- [ ] **Step 1: Write the failing tests**

```tsx
  it('turns a lit control off rather than leaving it stuck on', () => {
    // Pressing the coordinator control used to be a one-way door: it disabled
    // itself and hid the worker control behind it.
    const markup = board(withPools([pool('codex', [row({ role: 'coordinator' })])]))
    expect(markup).toContain('click to release')
    expect(markup).not.toContain('disabled=""')
  })

  it('offers both controls in every state', () => {
    for (const role of ['coordinator', 'worker', 'none'] as const) {
      const markup = board(withPools([pool('codex', [row({ role })])]))
      expect(markup).toContain('Coordinator:')
      expect(markup).toContain('Can be assigned work:')
    }
  })

  it('lights exactly one control, or neither', () => {
    const lit = (role: 'coordinator' | 'worker' | 'none') =>
      (board(withPools([pool('codex', [row({ role })])])).match(/aria-pressed="true"/g) ?? []).length
    expect(lit('coordinator')).toBe(1)
    expect(lit('worker')).toBe(1)
    expect(lit('none')).toBe(0)
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: `role` is not a property of `FleetAgentRow`.

- [ ] **Step 3: Implement**

In `fleet-model.ts`:

```ts
  const role: FleetAgentRow['role'] = agent.mode === 'coordinate'
    ? 'coordinator'
    : agent.worker === false ? 'none' : 'worker'
```

In `FleetAgent`, one handler and two buttons, neither disabled:

```tsx
      <button
        type="button"
        className={`fleet-toggle${agent.role === 'coordinator' ? ' on' : ''}`}
        aria-pressed={agent.role === 'coordinator'}
        aria-label={`Coordinator: ${agent.name}`}
        title={agent.role === 'coordinator'
          ? 'Coordinates this project — click to release'
          : coordinatorName ? `Coordinate — takes the role from ${coordinatorName}` : 'Make this agent the coordinator'}
        onClick={() => onSetRole?.(agent.id, agent.role === 'coordinator' ? 'none' : 'coordinator')}
      ><Network size={12} aria-hidden="true" /></button>
      <button
        type="button"
        className={`fleet-toggle${agent.role === 'worker' ? ' on' : ''}`}
        aria-pressed={agent.role === 'worker'}
        aria-label={`Can be assigned work: ${agent.name}`}
        title={agent.role === 'worker'
          ? 'Can be assigned work — click to exclude'
          : 'Excluded from assignment — click to include'}
        onClick={() => onSetRole?.(agent.id, agent.role === 'worker' ? 'none' : 'worker')}
      ><Hammer size={12} aria-hidden="true" /></button>
```

`App.tsx` wires one call:

```tsx
            onSetRole={(agentId, role) => { void window.api.setAgentRole(agentId, role) }}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1207** (three added, one replaced). Commit as
`feat: one three-state role switch, and no control that cannot be undone`.

---

### Task 5: Account type and plan become badges

**Files:**
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/fleet-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('renders the account type as a badge, not as grey text', () => {
    // The plan and the state beside it are badges. Same kind of fact.
    const markup = board(withPools([pool('gemini', [])]))
    expect(markup).toMatch(/class="[^"]*quota-badge-tight[^"]*"[^>]*>Antigravity OAuth</)
  })
```

If `formatProviderAccountType` renders a different string for the fixture's
`authMode: 'oauth'`, assert what it actually returns — do not change the
formatter to fit the test.

- [ ] **Step 2: Run to confirm failure**

Expected: the type is inside `.quota-head-source` as plain text.

- [ ] **Step 3: Implement**

Split `.quota-head-source` into the provider name as text and the auth mode and
plan as tight badges beside it, wrapping to a second line only if it must.

- [ ] **Step 4: Verify and commit**

Expected: **1208**. Commit as `feat: the account's type reads as a badge`.

---

### Task 6: Documentation, verification, report

- [ ] **Step 1: Correct the record**

`docs/superpowers/specs/2026-08-26-coordinator-role-awareness-design.md` states
that a fallback must stay in the same mode because the tool set differs. That
claim is false and its rule is now removed; annotate the section rather than
deleting it, the way this project has recorded its other reversals.

`docs/design/02-agent-runtime.md` (or wherever handoff is described) gains what
a handoff borrows and what it does not.

`docs/design/06-ui-shell.md` gains the three-state role switch and the fact that
a role change can touch two agents.

- [ ] **Step 2: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 3: Full verification**

```bash
npm test && npm run typecheck && npm run build
```

- [ ] **Step 4: Run the app**

Against the isolated dev profile, port 1305 checked free first:

1. Press coordinator on a second agent — the first goes dark, and stays dark
   after a restart.
2. Press the lit coordinator control — that agent returns to no role.
3. Press worker on the coordinating agent — it becomes a worker and releases.
4. A coordinator whose pool is spent continues on another account.
5. The account type reads as a badge.

- [ ] **Step 5: Report and stop**

Do not merge, tag or push. Report each task with its test count and wait.
