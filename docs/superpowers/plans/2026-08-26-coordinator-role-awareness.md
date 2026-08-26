# Coordinator Role Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Fallback never moves a turn to an agent that cannot do it, and a
coordinator knows it is one, knows its workers, and assigns without being asked.

**Architecture:** One filter on the fallback candidate set; one note composed
into `systemSuffix`, which is already resolved per step; one sentence framing
each delegated task.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- No configuration change. Everything needed is already in the manager.
- The roster is computed at call time, never baked into a cached runner.
- Nothing claims to stop a worker reasoning. A worker needs enough judgement to
  notice a failure and report it; what it must not do is redesign the task.
- Test baseline: 154 files, **1135** tests.
- Do not tag or bump the version.

---

### Task 1: Fallback stays in the same mode

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('does not hand a build turn to an agent in another mode', async () => {
    // Not a coordinate special case: a plan-mode agent is denied every write
    // tool, so it could never carry a build turn either. This has been wrong
    // since plan mode existed.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] (429): quota' }]]
    })
    manager.setMode('a3', 'plan')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
    expect(events.some(event => event.type === 'error')).toBe(true)
  })

  it('still hands over to an agent in the same mode', async () => {
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): quota' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
  })

  it('does not hand a coordinator turn to a worker', async () => {
    // A worker has no delegate tool, so it would do the work rather than
    // assign it — the opposite of what the turn was for.
    const { manager, events } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] (429): quota' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
  })
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/bs-agent-manager.test.ts
```

Expected: the first and third fail — a candidate in another mode is chosen.

- [ ] **Step 3: Implement**

In `handoff`, where candidates are gathered:

```ts
    const mode = this.modes.get(agentId) ?? 'build'
    const candidates = [...this.agents.values()]
      .filter(agent => agent.kind !== 'pty' && agent.cwd === this.agents.get(agentId)?.cwd)
      // A candidate in another mode has a different tool set: a plan or
      // coordinate agent cannot carry a build turn, and a worker asked to carry
      // a coordinating turn would do the work rather than assign it.
      .filter(other => (this.modes.get(other.id) ?? 'build') === mode)
      .flatMap(agent => { const c = this.candidateFor(agent.id); return c ? [c] : [] })
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1138**. Commit as `fix: keep a fallback in the same mode as the turn`.

Body must say this predates coordinate mode: a build agent could already fall
back to one in plan mode.

---

### Task 2: The coordinator's note

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

**Interfaces:**
- Produces: a private `coordinatorNote(agentId): string`, composed into the
  existing `systemSuffix`.

- [ ] **Step 1: Write the failing tests**

The harness records `llmSystems` per turn, so the note can be asserted through
what the model was actually sent.

```ts
  it('tells a coordinator who its workers are and what they run', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'go')
    const system = llmSystems[0]
    expect(system).toContain('coordinator')
    expect(system).toContain('helper')       // the other native agent
    expect(system).toContain('test-model')   // and what it runs
  })

  it('leaves a non-coordinator alone', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    await manager.send('a1', 'go')
    expect(llmSystems[0]).not.toContain('coordinator')
  })

  it('does not offer a coordinator another coordinator as a worker', async () => {
    const { manager, llmSystems } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    manager.setMode('a3', 'coordinate')
    await manager.send('a1', 'go')
    expect(llmSystems[0]).not.toContain('helper')
  })

  it('reflects a mode changed after the runner was built', async () => {
    // The case modeNote would get wrong: runners are cached per agent, so a
    // roster baked in at build time goes stale the moment anything changes.
    const { manager, llmSystems } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'a' }, { kind: 'finish' }], [{ kind: 'text', text: 'b' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await manager.send('a1', 'first')
    manager.setMode('a3', 'coordinate')
    await manager.send('a1', 'second')
    expect(llmSystems[0]).toContain('helper')
    expect(llmSystems[1]).not.toContain('helper')
  })
```

The last one is the reason this lives in `systemSuffix`. If it passes with the
note in `modeNote`, the test is wrong, not the design — check that `setMode`
does not rebuild the runner before believing it.

- [ ] **Step 2: Run to confirm failure**

Expected: the first, third and fourth fail — no note is produced.

- [ ] **Step 3: Implement**

```ts
  // Computed per call, not baked into the runner: runners are cached per agent,
  // so a roster fixed at build time goes stale as soon as an agent is added or
  // changes mode.
  private coordinatorNote(agentId: string): string {
    if ((this.modes.get(agentId) ?? 'build') !== 'coordinate') return ''
    const agent = this.agents.get(agentId)
    const workers = [...this.agents.values()]
      .filter(other => other.kind !== 'pty' && other.cwd === agent?.cwd && other.id !== agentId)
      .filter(other => (this.modes.get(other.id) ?? 'build') !== 'coordinate')
      .map(other => {
        const resolved = this.resolved.get(other.id)
        return `  ${other.name}${resolved?.model ? ` — ${resolved.provider}/${resolved.model}` : ''}`
      })
    return [
      '',
      '',
      'You are the coordinator for this project. You do not do the work yourself:',
      'your write, edit and command tools are removed, not merely discouraged.',
      '',
      'For coding work you do the analysis, the design, the spec and the plan, then',
      'assign the execution. Assign by default — when a request needs files written',
      'or commands run, give it to a worker rather than waiting to be asked to.',
      '',
      workers.length > 0 ? 'Workers available now:' : 'No workers are available in this project.',
      ...workers,
      '',
      'Each worker has its own conversation and sees only the task text you send it,',
      'so write each task so it stands on its own: name the files, the change and how',
      'to check it. A worker that cannot carry out what you gave it will report back',
      'rather than redesign it, so the judgement has to be in the task.'
    ].join('\n')
  }
```

Compose it into the existing suffix rather than replacing it:

```ts
      systemSuffix: () =>
        (this.executionForAgent(agent.id) ? SHARED_SESSION_RECORD_NOTE : '') +
        this.coordinatorNote(agent.id),
```

- [ ] **Step 4: Verify and commit**

Expected: **1142**. Commit as `feat: tell a coordinator its role and its roster`.

---

### Task 3: Frame the delegated task

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('frames a delegated task for the worker', async () => {
    const { manager } = await makeManager({
      secondAgent: true,
      partsQueue: [[{ kind: 'text', text: 'done' }, { kind: 'finish' }]]
    })
    manager.setMode('a1', 'coordinate')
    await delegate(manager, 'a1', 'helper', 'change the readme heading')
    const sent = manager.listChatMessages('a3').find(message => message.role === 'user')
    expect(sent?.text).toContain('change the readme heading')
    expect(sent?.text).toContain('report back')
  })
```

- [ ] **Step 2: Run to confirm failure**

Expected: the message is the bare task.

- [ ] **Step 3: Implement**

In `runAssignment`, before `send`:

```ts
    // One sentence, because this lands in the worker's own transcript where the
    // user will read it. It asks for a report on failure rather than a redesign:
    // the coordinator holds the context that judgement would need.
    const framed = `${task}\n\n[Assigned by ${coordinator?.name ?? 'the coordinator'}. Carry this out as specified; if you cannot, stop and report back rather than changing the approach.]`
    await this.send(target.id, framed)
```

- [ ] **Step 4: Verify and commit**

Expected: **1143**. Commit as `feat: frame a delegated task as work to carry out`.

---

### Task 4: Read-only git for a coordinator

**Files:**
- Modify: `src/main/agent/permission.ts`
- Test: `tests/unit/agent-permission.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
  it('lets a coordinator read history but not change it', () => {
    // Reviewing results is the coordinator's job and git diff is how it is done.
    // Committing is doing the work, and stays impossible.
    for (const args of ['diff', 'status', 'log --oneline -5', 'show HEAD']) {
      expect(decidePermission('coordinate', {}, noSaved, 'git', { args })).toBe('allow')
    }
    for (const args of ['commit -am x', 'push', 'stash', 'checkout main', 'reset --hard']) {
      expect(decidePermission('coordinate', {}, noSaved, 'git', { args })).toBe('deny')
    }
  })

  it('refuses a git flag that writes a file', () => {
    // argv runs without a shell so `>` is unavailable, but --output writes
    // anyway, and it can ride on a subcommand that is otherwise read-only.
    expect(decidePermission('coordinate', {}, noSaved, 'git', { args: 'diff --output=leak.txt' })).toBe('deny')
  })

  it('refuses git with no arguments at all', () => {
    expect(decidePermission('coordinate', {}, noSaved, 'git', {})).toBe('deny')
  })

  it('leaves git alone in the other modes', () => {
    expect(decidePermission('build', {}, noSaved, 'git', { args: 'commit -am x' })).toBe('ask')
    expect(decidePermission('plan', {}, noSaved, 'git', { args: 'diff' })).toBe('deny')
  })
```

The last case is deliberate: plan mode denies git entirely today and this work
does not change that. Only the coordinator gets the reading half.

- [ ] **Step 2: Run to confirm failure**

Expected: every coordinate case returns `deny` — the rule set denies `git`
outright.

- [ ] **Step 3: Implement**

In `permission.ts`, beside the plan-mode bash guard that already reads tool
input:

```ts
// A coordinator reviews results, so it reads history; committing is doing the
// work, so it cannot. Only subcommands known to read are allowed — an unknown
// one is refused, which is the safe direction.
const READ_ONLY_GIT = new Set([
  'diff', 'status', 'log', 'show', 'blame', 'ls-files', 'rev-parse', 'describe', 'shortlog'
])

export function isReadOnlyGit(args: string | undefined): boolean {
  if (!args) return false
  // --output=<file> writes a file even from `diff`, and argv runs without a
  // shell so this is the only redirection available to it.
  if (args.includes('--output')) return false
  const [subcommand] = args.trim().split(/\s+/)
  return READ_ONLY_GIT.has(subcommand)
}
```

and in `decidePermission`, beside the plan-mode bash branch:

```ts
  if (mode === 'coordinate' && toolName === 'git') {
    return isReadOnlyGit(typeof input?.args === 'string' ? input.args : undefined) ? 'allow' : 'deny'
  }
```

Remove `git` from the deny list inherited into `COORDINATE_RULES` is **not**
needed — the branch above runs first and settles it either way. Leave the
inherited `git: 'deny'` as the fallback for a call with no readable args.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1147**. Commit as `feat: let a coordinator read git history but not change it`.

Body must say what this corrects: denying git outright also denied `git diff`,
while reviewing results is the coordinator's stated job.

---

### Task 5: Documentation, verify, report

- [ ] **Step 1: Record it**

In `docs/design/02-agent-runtime.md`, beside the delegation section: the
coordinator's note, why it is computed per call, and the division of labour —
including that it is instruction rather than enforcement, and that reporting a
failure is part of a worker's job.

In `docs/design/03-providers.md`, the fallback section gains the same-mode rule.

In `docs/design/02-agent-runtime.md` also record the coordinator's tool reach:
read-only git through the input-aware permission branch, why read/glob/grep are
kept, and that `task` is denied so nothing is assigned outside the exchange.

- [ ] **Step 2: Correct the stale Next work**

`docs/design/README.md` still says "Group B is in progress" and lists group A as
future. Both are done.

- [ ] **Step 3: Regenerate the tables of contents**

```bash
npm run docs:toc
```

- [ ] **Step 4: Full verification**

```bash
npm test && npm run typecheck
```

Check the exit status of each, chained with `&&`.

- [ ] **Step 5: Run the app**

Open the coordination view and give the coordinator a task that needs a file
changed. It should assign without being told to, and name a worker that exists.
Check the worker's session for the framing.

- [ ] **Step 6: Report and stop**

Do not merge, tag, or push. Report all four tasks and wait.
