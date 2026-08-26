# Coordinator Task Exchange Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** An agent in coordinate mode can assign work to another of the user's
agents and act on the result, without being able to do the work itself.

**Architecture:** A third `AgentMode` whose rule set removes every working tool
and adds one; a `delegate` tool built by the manager that runs a turn in the
target agent's own session and returns its final message.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- The restriction is enforced by `visibleToolDefs`, never by prompt text. The
  coordinator must not be shown a tool it may not use.
- A delegation is a normal turn on the target agent, in that agent's own
  session, with its own provider and history.
- A worker failure is a tool error, not an exception. The coordinating turn
  continues so it can act on the failure.
- One level deep. `delegate` refuses a target that is itself coordinating.
- No cap on how many agents a coordinator may use. An arbitrary number would be
  a number nobody chose.
- Test baseline: 152 files, **1115** tests.
- Do not tag or bump the version.

---

### Task 1: Coordinate mode

**Files:**
- Modify: `src/shared/types.ts`, `src/main/agent/permission.ts`
- Test: `tests/unit/agent-permission.test.ts`

**Interfaces:**
- Produces: `AgentMode = 'build' | 'plan' | 'coordinate'` and
  `COORDINATE_RULES`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('hides every working tool from a coordinator', () => {
    // Enforced, not requested: the model is never shown a tool it may not use.
    for (const tool of ['write', 'edit', 'apply-patch', 'revert', 'bash', 'git', 'task']) {
      expect(decidePermission('coordinate', {}, () => false, tool)).toBe('deny')
    }
  })

  it('leaves a coordinator able to look, plan and assign', () => {
    for (const tool of ['read', 'glob', 'grep', 'todowrite', 'delegate']) {
      expect(decidePermission('coordinate', {}, () => false, tool)).toBe('allow')
    }
  })

  it('offers delegate in no other mode', () => {
    expect(decidePermission('build', {}, () => false, 'delegate')).toBe('deny')
    expect(decidePermission('plan', {}, () => false, 'delegate')).toBe('deny')
  })

  it('does not let a saved allow reopen a denied tool', () => {
    // The same guard plan mode already has: an always-allow saved in build mode
    // must not bypass this.
    expect(decidePermission('coordinate', {}, () => true, 'bash')).toBe('deny')
  })
```

Read `tests/unit/agent-permission.test.ts` first for its existing helpers; if the
file does not exist, create it following the closest neighbour.

- [ ] **Step 2: Run to confirm failure**

Expected: `'coordinate'` is not assignable to `AgentMode`.

- [ ] **Step 3: Implement**

In `src/shared/types.ts`:

```ts
export type AgentMode = 'build' | 'plan' | 'coordinate'
```

In `permission.ts`, beside `PLAN_RULES`:

```ts
// A coordinator assigns work; it does not do it. bash and git are denied
// outright rather than asked about, because running commands and committing are
// the work. That is deliberately stricter than plan mode and is the first thing
// to loosen if reviewing proves impossible without `git diff` — with evidence,
// not in advance.
export const COORDINATE_RULES: Record<string, PermissionRule> = {
  ...PLAN_RULES,
  bash: 'deny',
  todowrite: 'allow',
  delegate: 'allow'
}

// delegate exists only for a coordinator; every other mode denies it.
const DEFAULT_RULES: Record<string, PermissionRule> = { delegate: 'deny' }

export function rulesForMode(mode: AgentMode): Record<string, PermissionRule> {
  if (mode === 'plan') return { ...PLAN_RULES, ...DEFAULT_RULES }
  if (mode === 'coordinate') return COORDINATE_RULES
  return DEFAULT_RULES
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1119**. Commit as `feat: add a coordinate mode that cannot do the work`.

Body must say the restriction is enforced by hiding tools, following plan mode,
rather than by asking the model to behave.

---

### Task 2: The delegate tool

**Files:**
- Create: `src/main/agent/tools/delegate.ts`
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/agent-tools-delegate.test.ts`

**Interfaces:**
- Produces:

```ts
export function createDelegateTool(opts: {
  listWorkers: () => Array<{ name: string; coordinating: boolean }>
  run: (name: string, task: string) => Promise<{ output: string } | { error: string }>
}): ToolDefinition
```

The manager supplies both. The tool itself knows nothing about sessions.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDelegateTool } from '../../src/main/agent/tools/delegate'

const ctx = { cwd: '/proj', ask: async () => null } as never
const workers = [
  { name: 'anti-gemini-flash', coordinating: false },
  { name: 'boss', coordinating: true }
]

describe('delegate', () => {
  it('returns the worker\'s result', async () => {
    const run = vi.fn(async () => ({ output: 'done: 3 files changed' }))
    const tool = createDelegateTool({ listWorkers: () => workers, run })
    const result = await tool.run({ agent: 'anti-gemini-flash', task: 'update the readme' }, ctx)
    expect(run).toHaveBeenCalledWith('anti-gemini-flash', 'update the readme')
    expect(result.output).toContain('3 files changed')
  })

  it('names the agents that exist when given one that does not', async () => {
    const tool = createDelegateTool({ listWorkers: () => workers, run: async () => ({ output: '' }) })
    const result = await tool.run({ agent: 'nobody', task: 'x' }, ctx)
    expect(result.error).toContain('anti-gemini-flash')
  })

  it('refuses a target that is itself coordinating', async () => {
    // One level deep. Two coordinators delegating to each other would loop.
    const tool = createDelegateTool({ listWorkers: () => workers, run: async () => ({ output: '' }) })
    expect((await tool.run({ agent: 'boss', task: 'x' }, ctx)).error).toBeTruthy()
  })

  it('reports a worker failure as a tool error, not a throw', async () => {
    // A worker that fails is something the coordinator should act on, not a
    // crash of the coordinating turn.
    const tool = createDelegateTool({
      listWorkers: () => workers,
      run: async () => ({ error: 'quota exhausted everywhere' })
    })
    const result = await tool.run({ agent: 'anti-gemini-flash', task: 'x' }, ctx)
    expect(result.error).toContain('quota exhausted')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Expected: the module does not resolve.

- [ ] **Step 3: Implement the tool**

Follow `src/main/agent/tools/task.ts` for the `ToolDefinition` shape and its zod
schema. The description must say the task has to stand alone: the worker sees
the string and its own history, nothing the coordinator knows.

Self-delegation is refused by the manager rather than the tool, because the tool
does not know who is calling it — `listWorkers` simply excludes the caller.

- [ ] **Step 4: Wire it in the manager**

In `runnerFor`, beside `taskTool`:

```ts
    const delegateTool = createDelegateTool({
      // The caller is excluded here, so the tool never has to know who it is.
      listWorkers: () => [...this.agents.values()]
        .filter(other => other.kind !== 'pty' && other.cwd === agent.cwd && other.id !== agent.id)
        .map(other => ({ name: other.name, coordinating: (this.modes.get(other.id) ?? 'build') === 'coordinate' })),
      run: async (name, task) => {
        const target = [...this.agents.values()].find(other => other.name === name && other.cwd === agent.cwd)
        if (!target) return { error: `[bs] No agent named ${name}` }
        await this.send(target.id, task)
        const last = [...this.listMessages(target.id)].reverse().find(m => m.role === 'assistant')
        return last?.text ? { output: last.text } : { error: `[bs] ${name} produced no result` }
      }
    })
    runnerTools.set('delegate', delegateTool)
```

`send` already awaits the whole turn and `running` already serialises per agent,
so two delegations to different agents run at once and two to the same one
queue. No scheduler is added.

- [ ] **Step 5: Add the manager tests**

In `tests/unit/bs-agent-manager.test.ts`, using the `secondAgent` option added
for A2:

```ts
  it('runs a delegated task in the target agent\'s own session', async () => {
    const { manager } = await makeManager({ secondAgent: true })
    manager.setMode('a1', 'coordinate')
    // a1 delegates to a3; the exchange must land in a3's transcript, not a1's.
    // Drive the tool directly rather than hoping the stub model calls it.
  })
```

Write this against whatever the harness exposes; if the delegate tool cannot be
reached from outside, assert instead that `listMessages('a3')` grows after a
`send` and that `listMessages('a1')` does not. The claim being tested is that
the conversations stay separate.

- [ ] **Step 6: Verify and commit**

Expected: **1124**. Commit as `feat: let a coordinator delegate a task to another agent`.

---

### Task 3: Selecting the mode

**Files:**
- Modify: `src/renderer/src/components/chat/ChatPanel.tsx`,
  `src/renderer/src/styles.css`
- Test: `tests/unit/quota-snapshot.test.tsx` is the wrong home; add to whichever
  renderer test file covers ChatPanel's controls, or create one.

- [ ] **Step 1: Add the control**

`ChatPanel.tsx:857` renders a plan toggle and a hint at line 862. Add a
coordinate toggle beside it with its own hint — that the agent will assign work
rather than do it.

The existing `switchMode(currentMode === 'build' ? 'plan' : 'build')` at line 605
toggles between two modes and cannot express three. Replace it with an explicit
`switchMode(mode)` per control rather than widening the toggle.

- [ ] **Step 2: Verify and commit**

```bash
npm test && npm run typecheck && npm run build
```

Expected: **1124**. Commit as `feat: offer coordinate mode in the chat controls`.

---

### Task 4: Documentation, verify, report

- [ ] **Step 1: Record what A3a covers and what it does not**

In `docs/design/00-goals.md`, mark A3a landed and state that A3b — the separate
surface goal 4 asks for — remains. Describe the exchange in
`docs/design/02-agent-runtime.md` beside the subagent section, since the two are
now neighbours with different purposes.

- [ ] **Step 2: Record the risks that were not solved**

Add debt entries for the two named in the spec and left open: a fan-out cannot
be cancelled, and a coordinator can spend every worker's quota without a limit.
State the unblocking condition for each rather than a vague intention.

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

Put one agent in coordinate mode and ask it to have another agent make a small
change. Confirm three things by eye: the coordinator has no write tools, the
work appears in the **worker's** session, and the coordinator reads the result
back.

- [ ] **Step 6: Report and stop**

Do not merge, tag, or push. Report all four tasks, and say plainly that A3b is
not done — goal 4 asks for a separate surface and this is not it.
