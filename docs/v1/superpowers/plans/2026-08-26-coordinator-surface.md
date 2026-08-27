# Coordinator Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A surface outside the chat frame where a coordinator can be given a
command, its assignments watched as they run, and the whole fan-out stopped.

**Architecture:** The manager records assignments per coordinating turn and
emits them; `stop` cascades to the workers that turn started; the renderer gains
a top-level view that reads both.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- The record stays in memory. A finished assignment is reconstructible from the
  coordinator's transcript, and a second stored copy is how two copies come to
  disagree.
- Stopping a coordinator must not touch a worker running for something else.
- The view shows messages and takes input. It does not get tool cards, streaming
  detail or editing — that line is what keeps it from becoming the chat frame
  goal 4 asked to leave.
- Test baseline: 153 files, **1125** tests.
- Do not tag or bump the version.

---

### Task 1: Record an assignment while it runs

**Files:**
- Modify: `src/shared/types.ts`, `src/main/bs-agent-manager.ts`,
  `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

**Interfaces:**
- Produces:

```ts
export interface CoordinationAssignment {
  id: string
  coordinatorId: string
  turnId?: string
  workerId: string
  workerName: string
  task: string
  startedAt: number
  finishedAt?: number
  state: 'running' | 'completed' | 'failed'
  result?: string
}
```

plus two `ChatEvent` members and `listAssignments(coordinatorId): Promise<CoordinationAssignment[]>`.

- [x] **Step 1: Write the failing tests**

```ts
  it('records an assignment while the worker runs, not after', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'worker done' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    const running = manager.delegateForTest('a1', 'bs', 'do the thing')
    // Asserted before the await: the view exists to show work in flight, and a
    // record written only on completion would never show anything running.
    expect(manager.listAssignments('a1')[0]?.state).toBe('running')
    await running
    const done = manager.listAssignments('a1')[0]
    expect(done.state).toBe('completed')
    expect(done.result).toContain('worker done')
  })

  it('marks a failed assignment failed', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: 'boom' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.delegateForTest('a1', 'bs', 'x')
    expect(manager.listAssignments('a1')[0].state).toBe('failed')
  })

  it('emits both edges', async () => {
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'ok' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.delegateForTest('a1', 'bs', 'x')
    expect(events.some(e => e.type === 'assignment-started')).toBe(true)
    expect(events.some(e => e.type === 'assignment-finished')).toBe(true)
  })
```

`delegateForTest` does not exist. Rather than inventing a test-only method,
expose the delegate runner the tool already closes over — the manager builds
that closure in `runnerFor`, so lift it to a private method and let the test
reach it the way other manager internals are reached in this file. If that is
not possible without a cast, add the cast in the test and say why in a comment;
do not add a method to production whose only caller is a test.

- [x] **Step 2: Run to confirm failure**

Expected: `listAssignments` is not a function.

- [x] **Step 3: Implement**

In `src/shared/types.ts`, the interface above and:

```ts
  | { type: 'assignment-started'; agentId: string; assignment: CoordinationAssignment }
  | { type: 'assignment-finished'; agentId: string; assignment: CoordinationAssignment }
```

In the manager, beside `turnTargets`:

```ts
  // In memory on purpose. A finished assignment is reconstructible from the
  // coordinator's transcript, and the workers' sessions are already persisted;
  // a second stored copy is how two copies come to disagree.
  private assignmentsByCoordinator = new Map<string, CoordinationAssignment[]>()
```

The `run` callback given to `createDelegateTool` writes the record before
`await this.send(...)` and closes it after, emitting on both edges.

- [x] **Step 4: Add the channel**

`Channels.AgentListAssignments`, the `AgentApi` member, the preload
implementation and the main handler. Add the stub to `ipc-contract.test.ts` in
the same commit — that suite went 24 members behind once.

- [x] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1128**. Commit as `feat: record an assignment while its worker runs`.

---

### Task 2: Stop the fan-out

**Files:**
- Modify: `src/main/bs-agent-manager.ts`, `docs/technical-debt.md`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [x] **Step 1: Write the failing tests**

```ts
  it('stops the workers a coordinating turn started', async () => {
    const { manager } = await makeManager({ secondAgent: true, hangUntilAbort: true })
    manager.setMode('a1', 'coordinate')
    void manager.delegateForTest('a1', 'bs', 'long job')
    await new Promise(resolve => setTimeout(resolve, 10))
    manager.stop('a1')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(manager.isRunning('a3')).toBe(false)
  })

  it('leaves a worker running for something else alone', async () => {
    // The cascade follows assignments, not agents. A worker busy with its own
    // conversation is not part of this fan-out.
    const { manager } = await makeManager({ secondAgent: true, hangUntilAbort: true })
    manager.setMode('a1', 'coordinate')
    void manager.send('a3', 'its own work')
    await new Promise(resolve => setTimeout(resolve, 10))
    manager.stop('a1')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(manager.isRunning('a3')).toBe(true)
  })
```

- [x] **Step 2: Run to confirm failure**

Expected: the first fails — the worker keeps running.

- [x] **Step 3: Implement**

In `stop(agentId)`, after aborting the agent's own turn, abort every worker with
a `running` assignment under that coordinator:

```ts
    // Debt item 11: Stop was per agent, so stopping a coordinator left every
    // worker it started running, with nothing to gather them.
    for (const assignment of this.assignmentsByCoordinator.get(agentId) ?? []) {
      if (assignment.state === 'running') this.stop(assignment.workerId)
    }
```

One level deep, because delegation is: a worker cannot itself be coordinating,
so there is no tree to walk and no guard against recursion needed.

- [x] **Step 4: Close debt item 11**

Remove it, renumber the survivors, repoint the index anchors and any citation.

- [x] **Step 5: Verify and commit**

Expected: **1130**. Commit as `feat: stop the workers a coordinator started`.

---

### Task 3: The view

**Files:**
- Create: `src/renderer/src/components/coordinator/CoordinatorView.tsx`
- Modify: `src/renderer/src/App.tsx`,
  `src/renderer/src/components/TitleBar.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/coordinator-view.test.tsx` (create)

**Interfaces:**
- Consumes: `listAssignments`, the two events, `sendChat`, `stopAgent`,
  `listMessages`.

- [x] **Step 1: Write the failing tests**

Render the presentational half with `renderToStaticMarkup`, the way
`StatsView` and `FeedRow` are tested. Split the component so the fetching half
and the rendering half are separate, as `StatsTab`/`StatsView` already are.

```tsx
  it('lists an assignment with its worker, task and state', () => {
    const markup = renderToStaticMarkup(React.createElement(CoordinatorBoard, {
      coordinatorName: 'boss', messages: [], assignments: [assignment({ state: 'running' })],
      onSend: () => {}, onStop: () => {}, onOpenWorker: () => {}
    }))
    expect(markup).toContain('anti-gemini-flash')
    expect(markup).toContain('update the readme')
    expect(markup).toContain('running')
  })

  it('shows the result once an assignment completes', () => {
    const markup = renderToStaticMarkup(React.createElement(CoordinatorBoard, {
      coordinatorName: 'boss', messages: [],
      assignments: [assignment({ state: 'completed', result: '3 files changed' })],
      onSend: () => {}, onStop: () => {}, onOpenWorker: () => {}
    }))
    expect(markup).toContain('3 files changed')
  })

  it('says so when the project has no coordinator', () => {
    // Rendering an empty board would look like a coordinator with nothing to do.
    expect(renderToStaticMarkup(React.createElement(CoordinatorBoard, {
      coordinatorName: null, messages: [], assignments: [],
      onSend: () => {}, onStop: () => {}, onOpenWorker: () => {}
    }))).toContain('No agent is coordinating')
  })

  it('does not render tool detail', () => {
    // The line that keeps this from becoming the chat frame it exists to
    // replace: to read the detail, open the worker's session.
    const markup = renderToStaticMarkup(React.createElement(CoordinatorBoard, {
      coordinatorName: 'boss', messages: [{ id: 'm1', role: 'assistant', text: 'planning', createdAt: 1 }],
      assignments: [], onSend: () => {}, onStop: () => {}, onOpenWorker: () => {}
    }))
    expect(markup).not.toContain('tool-call')
  })
```

- [x] **Step 2: Run to confirm failure**

Expected: the module does not resolve.

- [x] **Step 3: Implement the board**

`CoordinatorBoard` is presentational: the coordinator's name and recent
messages, an input, a Stop, and one row per assignment with worker, task, state
and result. A row calls `onOpenWorker`.

`CoordinatorView` wraps it: fetches assignments on mount, subscribes to the two
events, and wires the handlers to `sendChat`, `stopAgent` and selecting that
agent in the workspace view.

- [x] **Step 4: Switch to it from the shell**

`App.tsx` gains `view: 'workspace' | 'coordinate'` and renders one or the other
inside `<main>`. `TitleBar` gains a control, enabled only when
`runtime.workspace.agents` contains one whose `mode` is `'coordinate'`, and
disabled with a title saying why when it does not.

Opening a worker switches back to the workspace view with that agent selected,
which `setSelectedNativeAgentId` already does.

- [x] **Step 5: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1134**. Commit as `feat: a surface for the coordinator outside the chat frame`.

---

### Task 4: Documentation, verify, report

- [x] **Step 1: Record it**

Describe the surface in `docs/design/06-ui-shell.md` — including that it is a
top-level view rather than a panel, and why. Mark A3b landed in
`docs/design/00-goals.md`, which completes group A.

- [x] **Step 2: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [x] **Step 3: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`.

- [x] **Step 4: Run the app**

Give a coordinator a command that fans out to two agents. Watch both rows
appear as **running**, open one worker's session from its row, come back, and
stop the fan-out mid-flight. Confirm the workers actually stopped.

- [x] **Step 5: Report and stop**

Do not merge, tag, or push. Report all four tasks and wait for the final gate.
