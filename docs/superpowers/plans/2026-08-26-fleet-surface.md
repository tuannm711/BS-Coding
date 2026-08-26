# Fleet Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** One panel shows every agent, the pool it drains and who directs; and
an assignment reflects the turn it actually started.

**Architecture:** A completion hook kept beside the queue (never inside it, the
queue crosses IPC); a steer exclusion for assigned messages; one exclusivity
rule in `setMode`; and a `fleet` variant of the existing account card that nests
agents inside the quota group they draw on.

**Tech Stack:** TypeScript, vitest, React 19, Electron.

## Global Constraints

- Test baseline: **154 files, 1147 tests**. Report the count after each task.
- **Nothing may be added to `QueuedMessage` that is not structured-cloneable.**
  `emitQueue` sends `this.queues.get(agentId)` verbatim over IPC.
- The palette, the type scale and the token names are untouched. This work moves
  functions; it does not restyle them.
- Do not tag or bump the version. Do not merge.
- Only one side branch exists at a time — this branch, `feat/fleet-surface`.

---

### Task 1: The queue can report a message's completion

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

**Interfaces:**
- Produces: `sendAwaited(agentId: string, text: string, images?: ImageAttachment[], displayText?: string): Promise<void>`
  — resolves after **this message's own turn** has run, or immediately if it
  never will.

- [ ] **Step 1: Write the failing tests**

```ts
  it('does not resolve an awaited send while the message is still queued', async () => {
    const { manager } = await makeManager({
      partsQueue: [
        [{ kind: 'text', text: 'first' }, { kind: 'finish' }],
        [{ kind: 'text', text: 'second' }, { kind: 'finish' }]
      ],
      hangUntilAbort: false
    })
    const first = manager.send('a1', 'one')
    let settled = false
    const second = manager.sendAwaited('a1', 'two').then(() => { settled = true })
    // Asserted while it is still in the queue: this is the whole bug — send
    // resolved on acceptance, so a caller could not tell queued from finished.
    expect(settled).toBe(false)
    await Promise.all([first, second])
    expect(settled).toBe(true)
  })

  it('resolves an awaited send that runs inline', async () => {
    const { manager } = await makeManager({
      partsQueue: [[{ kind: 'text', text: 'done' }, { kind: 'finish' }]]
    })
    await manager.sendAwaited('a1', 'go')
    expect(manager.listMessages('a1').some(m => m.role === 'assistant')).toBe(true)
  })

  it('resolves an awaited send that the queue refuses', async () => {
    const { manager } = await makeManager({ hangUntilAbort: true })
    void manager.send('a1', 'busy')
    await new Promise(resolve => setTimeout(resolve, 10))
    for (let i = 0; i < 5; i += 1) void manager.send('a1', `fill ${i}`)
    // The sixth is refused. A refusal that never resolved would hang the
    // coordinator exactly as a silent worker does.
    await manager.sendAwaited('a1', 'refused')
    manager.stop('a1')
  })

  it('resolves an awaited send whose queued message is deleted', async () => {
    const { manager } = await makeManager({ hangUntilAbort: true })
    void manager.send('a1', 'busy')
    await new Promise(resolve => setTimeout(resolve, 10))
    let settled = false
    const pending = manager.sendAwaited('a1', 'doomed').then(() => { settled = true })
    const queued = manager.listQueued('a1')[0]
    manager.removeQueued('a1', queued.id)
    await pending
    expect(settled).toBe(true)
    manager.stop('a1')
  })

  it('resolves an awaited send whose agent is removed', async () => {
    const { manager } = await makeManager({ hangUntilAbort: true })
    void manager.send('a1', 'busy')
    await new Promise(resolve => setTimeout(resolve, 10))
    const pending = manager.sendAwaited('a1', 'orphan')
    manager.remove('a1')
    await pending
  })
```

If `manager.remove` is named differently in this file, use the name the other
removal tests use — do not add an alias.

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/bs-agent-manager.test.ts
```

Expected: `manager.sendAwaited is not a function`.

- [ ] **Step 3: Implement**

Beside `queues`:

```ts
  // Kept beside the queue, never inside it: emitQueue sends the array itself
  // over IPC, and a function field would fail structured clone.
  private queueHooks = new Map<string, () => void>()

  private settleQueued(id: string): void {
    const hook = this.queueHooks.get(id)
    if (!hook) return
    this.queueHooks.delete(id)
    hook()
  }
```

`sendAwaited` mirrors `send`, but keeps the message id so it can be settled:

```ts
  // send() resolves when the message is accepted, which is what every other
  // caller wants. A coordinator needs the opposite: resolution when the work
  // is done. Same queue, different promise.
  async sendAwaited(agentId: string, text: string, images?: ImageAttachment[], displayText?: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return
    if (!this.running.has(agentId)) {
      await this.runTurn(agentId, text, images, displayText)
      await this.drainQueue(agentId)
      return
    }
    const q = this.queues.get(agentId) ?? []
    if (q.length >= this.MAX_QUEUE) {
      this.emit({ type: 'error', agentId, message: '[bs] Hàng đợi đã đầy (tối đa 5 tin). Hãy chờ turn hiện tại xong hoặc xóa tin đang chờ.' })
      return
    }
    const id = randomUUID()
    const settled = new Promise<void>(resolve => this.queueHooks.set(id, resolve))
    q.push({ id, text, images, displayText, assigned: true })
    this.queues.set(agentId, q)
    this.emitQueue(agentId)
    await settled
  }
```

Add the `assigned` field to `QueuedMessage` in `src/shared/types.ts` in this
task, so the literal above compiles. Task 2 gives it its behaviour:

```ts
  // Delegated by a coordinator. Steering is something a person does while
  // watching an agent work; a coordinator is not watching, it is waiting for a
  // result it will act on. So this runs as its own turn — see Task 2.
  assigned?: boolean
```

Settle at every exit. In `drainQueue`, after the turn:

```ts
    await this.runTurn(agentId, next.text, next.images, next.displayText)
    this.settleQueued(next.id)
    await this.drainQueue(agentId)
```

In `removeQueued`, inside the branch that found the message:

```ts
      this.settleQueued(id)
```

At the agent-removal site that calls `this.queues.delete(agentId)` (around line
272), settle every message first:

```ts
    for (const queued of this.queues.get(agentId) ?? []) this.settleQueued(queued.id)
    this.queues.delete(agentId)
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1152**. Commit as `feat: let a caller await a queued message's own turn`.

The body must state the constraint that shaped it: the queue crosses IPC, so
the hook lives beside it.

---

### Task 2: A delegated task is not absorbed as steering

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Create: `src/shared/queue-steer.ts`
- Test: `tests/unit/queue-steer.test.ts` (create)

**Interfaces:**
- Produces: `partitionSteers(queue: QueuedMessage[]): { steers: QueuedMessage[]; keep: QueuedMessage[] }`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { partitionSteers } from '../../src/shared/queue-steer'
import type { QueuedMessage } from '../../src/shared/types'

const message = (patch: Partial<QueuedMessage> = {}): QueuedMessage =>
  ({ id: 'm1', text: 'hello', ...patch })

describe('partitionSteers', () => {
  it('lets an ordinary queued message steer the running turn', () => {
    const { steers, keep } = partitionSteers([message()])
    expect(steers).toHaveLength(1)
    expect(keep).toHaveLength(0)
  })

  it('keeps an assigned message out of the running turn', () => {
    // A delegated task folded into unrelated work has no turn of its own to
    // await and no output of its own to report.
    const { steers, keep } = partitionSteers([message({ id: 'm2', assigned: true })])
    expect(steers).toHaveLength(0)
    expect(keep.map(item => item.id)).toEqual(['m2'])
  })

  it('splits a mixed queue and preserves order within each side', () => {
    const { steers, keep } = partitionSteers([
      message({ id: 'a' }), message({ id: 'b', assigned: true }), message({ id: 'c' })
    ])
    expect(steers.map(item => item.id)).toEqual(['a', 'c'])
    expect(keep.map(item => item.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Expected: the module does not resolve.

- [ ] **Step 3: Implement**

`src/shared/queue-steer.ts`:

```ts
import type { QueuedMessage } from './types'

export function partitionSteers(queue: QueuedMessage[]): { steers: QueuedMessage[]; keep: QueuedMessage[] } {
  return {
    steers: queue.filter(message => !message.assigned),
    keep: queue.filter(message => message.assigned)
  }
}
```

In the manager's `takeSteers`:

```ts
      takeSteers: () => {
        const q = this.queues.get(agent.id)
        if (!q || q.length === 0) return []
        const { steers, keep } = partitionSteers(q)
        if (keep.length === 0) this.queues.delete(agent.id)
        else this.queues.set(agent.id, keep)
        this.emitQueue(agent.id)
        return steers
      },
```

The literal in `sendAwaited` already sets `assigned: true` from Task 1.

- [ ] **Step 4: Verify and commit**

Expected: **1155**. Commit as `feat: run a delegated task as its own turn`.

---

### Task 3: An assignment reports the turn it started

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('marks an assignment failed when its own turn produced nothing', async () => {
    // The worker already answered once. A failing assignment must not report
    // that earlier answer as its result.
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'text', text: 'an earlier answer' }, { kind: 'finish' }],
        [{ kind: 'error', error: 'boom' }]
      ]
    })
    await manager.send('a3', 'unrelated earlier work')
    manager.setMode('a1', 'coordinate')
    await manager.delegateForTest('a1', 'helper', 'the real task')
    const assignment = manager.listAssignments('a1')[0]
    expect(assignment.state).toBe('failed')
    expect(assignment.result ?? '').not.toContain('an earlier answer')
  })

  it('reports only what its own turn produced', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'text', text: 'an earlier answer' }, { kind: 'finish' }],
        [{ kind: 'text', text: 'the assigned result' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a3', 'unrelated earlier work')
    manager.setMode('a1', 'coordinate')
    await manager.delegateForTest('a1', 'helper', 'the real task')
    const assignment = manager.listAssignments('a1')[0]
    expect(assignment.state).toBe('completed')
    expect(assignment.result).toContain('the assigned result')
    expect(assignment.result).not.toContain('an earlier answer')
  })

  it('keeps an assignment running until a busy worker reaches its turn', async () => {
    const { manager } = await makeManager({ secondAgent: true, hangUntilAbort: true })
    manager.setMode('a1', 'coordinate')
    void manager.send('a3', 'worker is already busy')
    await new Promise(resolve => setTimeout(resolve, 10))
    void manager.delegateForTest('a1', 'helper', 'queued behind it')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(manager.listAssignments('a1')[0].state).toBe('running')
    manager.stop('a1')
    manager.stop('a3')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the first two fail — the earlier answer is reported, and a failed
turn is marked completed.

- [ ] **Step 3: Implement**

Replace the tail of `runAssignment`. Delete the comment claiming *"send awaits
the whole turn"* — it is the false statement this task exists to correct:

```ts
    // The boundary, not turnId: ChatMessage.turnId comes from
    // executionForAgent(...)?.execution.turnId and is absent unless the agent
    // is in a shared execution, so keying on it works in tests and fails in
    // ordinary use.
    const before = this.listMessages(target.id).length
    await this.sendAwaited(target.id, framed)
    const produced = this.listMessages(target.id).slice(before)
      .filter(message => message.role === 'assistant')
      .map(message => message.text)
      .filter(text => text.trim().length > 0)
    assignment.finishedAt = Date.now()
    assignment.state = produced.length > 0 ? 'completed' : 'failed'
    if (produced.length > 0) assignment.result = produced.join('\n')
    this.emit({ type: 'assignment-finished', agentId: coordinatorId, assignment })
    return produced.length > 0
      ? { output: produced.join('\n') }
      : { error: `[bs] ${target.name} produced no result` }
```

Keep whatever the existing code does after `assignment.state` for emitting and
returning if it differs; the change is the boundary and `sendAwaited`, not the
event.

- [ ] **Step 4: Verify and commit**

Expected: **1158**. Commit as `fix: report the turn an assignment actually started`.

---

### Task 4: One coordinator per project

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('takes the coordinator role from whoever held it', async () => {
    const { manager } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    manager.setMode('a3', 'coordinate')
    expect(manager.modeFor('a1')).toBe('build')
    expect(manager.modeFor('a3')).toBe('coordinate')
  })

  it('leaves a coordinator in another project alone', async () => {
    // cwd is what separates projects here, as it does for fallback and for the
    // coordinator's roster.
    const { manager } = await makeManager({ secondAgent: true, secondProject: true })
    manager.setMode('a1', 'coordinate')
    manager.setMode('b1', 'coordinate')
    expect(manager.modeFor('a1')).toBe('coordinate')
  })

  it('does not disturb agents in other modes', async () => {
    const { manager } = await makeManager({ secondAgent: true })
    manager.setMode('a3', 'plan')
    manager.setMode('a1', 'coordinate')
    expect(manager.modeFor('a3')).toBe('plan')
  })
```

`modeFor` and `secondProject` may not exist. If the file already reads modes
another way, use that; otherwise read `manager.listAgents()` for the agent's
`mode`. For `secondProject`, add an agent with a different `cwd` to the harness
the same way `secondAgent` is added — one option, not a second harness.

- [ ] **Step 2: Run to confirm failure**

Expected: the first fails — both agents coordinate.

- [ ] **Step 3: Implement**

At the top of `setMode`, before the mode is stored:

```ts
    // Enforced here rather than in the view: the manager knows each agent's
    // cwd, so the rule holds whichever surface calls it and there is no second
    // copy to disagree. Recursion terminates — the branch only runs for
    // 'coordinate' and demotion passes 'build'.
    if (mode === 'coordinate') {
      const cwd = this.agents.get(agentId)?.cwd
      for (const other of [...this.agents.values()]) {
        if (other.id === agentId || other.cwd !== cwd) continue
        if ((this.modes.get(other.id) ?? 'build') === 'coordinate') this.setMode(other.id, 'build')
      }
    }
```

The array copy is deliberate: `setMode` writes back into `this.agents`.

- [ ] **Step 4: Verify and commit**

Expected: **1161**. Commit as `feat: one coordinator per project`.

---

### Task 5: The fleet model

**Files:**
- Create: `src/renderer/src/components/fleet/fleet-model.ts`
- Test: `tests/unit/fleet-model.test.ts` (create)

**Interfaces:**
- Produces:

```ts
export interface FleetAgentRow {
  id: string
  name: string
  mode: AgentMode
  modelId?: string
  modelLabel?: string
  coordinator: boolean
}

export interface FleetPool {
  group: ProviderQuotaGroup
  agents: FleetAgentRow[]
}

export interface FleetAccount {
  key: string
  account: ProviderAccountSnapshot
  state: QuotaAccountUiState
  pools: FleetPool[]
  strays: FleetAgentRow[]      // configured for this account, no matching pool
}

export interface FleetModel {
  accounts: FleetAccount[]
  unassigned: FleetAgentRow[]  // no ready assignment at all
}

export function buildFleet(agents: AgentConfig[], snapshot: ProviderSnapshot | null): FleetModel
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildFleet } from '../../src/renderer/src/components/fleet/fleet-model'
import type { AgentConfig } from '../../src/shared/types'

const agent = (patch: Partial<AgentConfig> = {}): AgentConfig =>
  ({ id: 'a1', name: 'anti-claude-opus', templateId: 't', cwd: '/p', kind: 'native', ...patch })

const snapshot = () => ({
  accounts: [{
    id: 'acc1', providerId: 'antigravity', label: 'bdg', status: 'active',
    authMode: 'oauth', models: [], usage: {
      status: 'ready',
      quotaGroups: [
        { id: 'gemini', label: 'gemini', modelIds: ['gemini-3.6-flash-high'], windows: [] },
        { id: 'claude-gpt', label: 'claude-gpt', modelIds: ['claude-opus-4-6-thinking', 'claude-sonnet-4-6'], windows: [] }
      ]
    }
  }],
  assignments: [
    { agentId: 'a1', providerId: 'antigravity', accountId: 'acc1', modelId: 'claude-opus-4-6-thinking', status: 'ready', revision: 1 },
    { agentId: 'a2', providerId: 'antigravity', accountId: 'acc1', modelId: 'claude-sonnet-4-6', status: 'ready', revision: 1 }
  ]
}) as never

describe('buildFleet', () => {
  it('puts two models that share a pool under one pool', () => {
    // The reason this surface exists: in a flat list these read as
    // alternatives, when exhausting one exhausts both.
    const fleet = buildFleet([agent(), agent({ id: 'a2', name: 'anti-claude-sonnet' })], snapshot())
    const pools = fleet.accounts[0].pools.filter(pool => pool.agents.length > 0)
    expect(pools).toHaveLength(1)
    expect(pools[0].group.id).toBe('claude-gpt')
    expect(pools[0].agents.map(row => row.name)).toEqual(['anti-claude-opus', 'anti-claude-sonnet'])
  })

  it('still lists an agent with no ready assignment', () => {
    // A roster that hides an agent is not a roster.
    const fleet = buildFleet([agent({ id: 'a9', name: 'newcomer' })], snapshot())
    expect(fleet.unassigned.map(row => row.name)).toEqual(['newcomer'])
  })

  it('marks the coordinator and nobody else', () => {
    const fleet = buildFleet([
      agent({ mode: 'coordinate' }), agent({ id: 'a2', name: 'anti-claude-sonnet' })
    ], snapshot())
    const rows = fleet.accounts.flatMap(account => account.pools.flatMap(pool => pool.agents))
    expect(rows.filter(row => row.coordinator).map(row => row.name)).toEqual(['anti-claude-opus'])
  })

  it('returns everything as unassigned with no snapshot', () => {
    const fleet = buildFleet([agent()], null)
    expect(fleet.accounts).toHaveLength(0)
    expect(fleet.unassigned).toHaveLength(1)
  })

  it('keeps an agent whose model matches no pool under its account', () => {
    const fleet = buildFleet([agent({ id: 'a3', name: 'odd' })], {
      ...snapshot() as never,
      assignments: [{ agentId: 'a3', providerId: 'antigravity', accountId: 'acc1', modelId: 'unknown-model', status: 'ready', revision: 1 }]
    } as never)
    expect(fleet.accounts[0].strays.map(row => row.name)).toEqual(['odd'])
    expect(fleet.unassigned).toHaveLength(0)
  })
})
```

If the real `ProviderSnapshot` requires fields the literals above omit, add
them to the literals — do not widen the production types to fit a test.

- [ ] **Step 2: Run to confirm failure**

Expected: the module does not resolve.

- [ ] **Step 3: Implement**

Group agents by `providerId/accountId` from `snapshot.assignments` where
`status === 'ready'`, exactly as `buildQuotaRows` does. Within an account, place
each agent in the first `quotaGroups` entry whose `modelIds` includes the
agent's model; an agent matching none goes to `strays`; an agent with no ready
assignment goes to `unassigned`. Reuse `quotaAccountState` from
`../quota/quota-view` for the account state rather than restating it.

- [ ] **Step 4: Verify and commit**

Expected: **1166**. Commit as `feat: model the fleet by quota pool`.

---

### Task 6: The Fleet tab

**Files:**
- Create: `src/renderer/src/components/fleet/FleetPanel.tsx`
- Modify: `src/renderer/src/components/quota/QuotaAccountCard.tsx`,
  `src/renderer/src/components/RightPanel.tsx`,
  `src/renderer/src/App.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/fleet-panel.test.tsx` (create)

**Interfaces:**
- Consumes: `buildFleet` from Task 5.
- Produces: `FleetPanel({ fleet, onSelectAgent, onSetCoordinator })`.

- [ ] **Step 1: Write the failing tests**

Follow the convention in `tests/unit/coordinator-view.test.tsx`:
`renderToStaticMarkup` against the presentational component.

```tsx
  it('nests agents under the pool they draw on', () => {
    const markup = panel(fleetWithSharedPool())
    const poolIndex = markup.indexOf('claude-gpt')
    expect(poolIndex).toBeGreaterThan(-1)
    expect(markup.indexOf('anti-claude-opus')).toBeGreaterThan(poolIndex)
    expect(markup.indexOf('anti-claude-sonnet')).toBeGreaterThan(poolIndex)
  })

  it('shows an agent that has no account yet', () => {
    expect(panel(fleetWithUnassigned())).toContain('newcomer')
  })

  it('marks the coordinator', () => {
    expect(panel(fleetWithCoordinator())).toContain('coordinates')
  })

  it('says so when the project has no agents', () => {
    expect(panel({ accounts: [], unassigned: [] })).toContain('No agents in this project')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the module does not resolve.

- [ ] **Step 3: Give the card a fleet variant**

`QuotaAccountCard` renders `agents` flat at one place and `groups` at another,
which is what hides the sharing. Add `'fleet'` to the `variant` union and an
optional `pools?: FleetPool[]`. When `variant === 'fleet'`, render each group
with its agents inside it and skip the flat agent list; the header, badges,
refresh, reset-credit control and metrics are unchanged and shared.

Do not fork the component. The two other variants must render exactly as they
do today — assert that by running the existing quota tests unchanged.

- [ ] **Step 4: Build the panel and the tab**

`FleetPanel` renders one `QuotaAccountCard` per `FleetAccount` in fleet variant,
then a plain **Unassigned** section listing `unassigned` rows by name and mode.

In `RightPanel`, widen `tab` to `'tree' | 'artifacts' | 'fleet'`, add the third
tab button with a distinct `lucide-react` icon, and **remove the pinned
`<RightPanelQuota agents={...} />`** — its content now lives in the tab.

In `App.tsx`: widen the `rightTab` state and its `localStorage` read, rejecting
any stored value outside the union. Pass **all** native agents of the project,
not `panes.filter(...)` — the current call site passes only visible panes, which
would hide exactly the agents a roster exists to show.

- [ ] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1170**. Commit as `feat: a fleet panel grouped by quota pool`.

---

### Task 7: Coordinate leaves the mode row

**Files:**
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`,
  `src/renderer/src/components/TitleBar.tsx`,
  `src/renderer/src/components/coordinator/CoordinatorView.tsx`,
  `src/renderer/src/App.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/coordinator-view.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('routes an empty board to the fleet panel rather than offering a second picker', () => {
    // One place gives the role. A picker here would be a second control doing
    // the same job, which is how the project ended up with two coordinators.
    const markup = board({ coordinatorName: null })
    expect(markup).toContain('Fleet')
    expect(markup).not.toContain('<select')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the empty board still says only *No agent is coordinating*.

- [ ] **Step 3: Implement**

In `ChatPanel.tsx` remove the Coordinate button from `.chat-mode` and the
`currentMode === 'coordinate'` hint. Build and Plan remain.

In `TitleBar.tsx` replace the single disabled-when-absent button with a
two-way switch, **Work** and **Coordination**, both always enabled.

In `CoordinatorView.tsx` the empty state gains one action that opens the Fleet
tab, wired from `App.tsx` by setting `rightTab` to `'fleet'` and opening the
right panel.

In `App.tsx`, `coordinator` may keep using `find` — Task 4 makes at most one
match possible — but the comment must say that the invariant is enforced in
`setMode`, not assumed here.

In `styles.css` remove any rule that existed only for the Coordinate button or
the coordinate hint. Do not add `flex-wrap` to `.chat-mode`: with two buttons
the row fits, and wrapping would hide the next crowding rather than reveal it.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1171**. Commit as `feat: set the coordinator in fleet, not in the mode row`.

---

### Task 8: Documentation, verification, report

- [ ] **Step 1: Record it**

In `docs/design/06-ui-shell.md`, describe the three-scope rule, the Fleet tab
and why the pinned quota block is gone. Note under the coordinator surface that
the role is exclusive per project and set in Fleet.

Add a technical-debt entry for what this deliberately did not do: `Settings →
Agents` still holds the per-agent provider, model and account binding, which is
project-scoped configuration in an app-scoped dialog.

- [ ] **Step 2: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 3: Full verification**

```bash
npm test && npm run typecheck && npm run build
```

Chain with `&&` and check the exit status.

- [ ] **Step 4: Run the app**

Confirm in the running app, with the owner's own project:

1. The mode row shows two buttons and does not overflow.
2. Fleet lists every agent, with `anti-claude-opus` and `anti-claude-sonnet`
   under one bar.
3. Setting a second agent to coordinate demotes the first, and Fleet says which.
4. Delegating to a **busy** worker leaves the assignment `running` until that
   worker's own turn runs — the case that produced silence.
5. A worker whose turn fails shows `failed`, not an earlier answer.

- [ ] **Step 5: Report and stop**

Do not merge, tag or push. Report every task with its test count and wait for
the final gate.
