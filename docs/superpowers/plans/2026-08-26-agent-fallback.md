# Agent Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** When an agent's quota is refused mid-turn, continue the same turn on
the closest available agent.

**Architecture:** A pure ranking function in `src/shared`; two optional fields on
`LoopDeps` so the loop can be told who to call next without learning what an
agent is; the manager owns the swap and recompiles the history neutrally.

**Tech Stack:** TypeScript, vitest, React 19.

## Global Constraints

- One turn, one `turnId`, one snapshot. A handover must not split the turn, or
  undo would revert half of what happened.
- Only quota and capacity refusals hand over. Auth and invalid-request do not:
  repeating a malformed request elsewhere just fails again.
- A candidate whose pool is already spent is dropped **before** ranking, never
  tried and skipped.
- Ranking is by similarity to the agent being replaced. Remaining quota only
  excludes a candidate; it never reorders the rest.
- Each candidate is tried at most once per turn.
- Test baseline: 151 files, **1105** tests.
- Do not tag or bump the version.

### The owner's real configuration, used as the fixture

```
antigravity / claude-opus-4-6-thinking   anti-claude-opus     pool claude-gpt (spent)
antigravity / claude-sonnet-4-6          anti-claude-sonnet   pool claude-gpt (spent)
antigravity / gemini-3.6-flash-high      anti-gemini-flash    pool gemini 93.74%
openai      / gpt-5.6-sol                bs                   openai-base
openai      / gpt-5.6-sol                a.lcottdustin6360    openai-base
openai      / gpt-5.6-sol                h.ernandezrob5612    openai-base
openai      / gpt-5.6-terra              bs-free-gpt-terra    openai-base
```

---

### Task 1: The ranking

**Files:**
- Create: `src/shared/agent-fallback.ts`
- Test: `tests/unit/agent-fallback-rank.test.ts`

**Interfaces:**
- Produces:

```ts
export interface FallbackCandidate {
  agentId: string
  providerId: string
  modelId: string
  accountId?: string
}

export function rankFallbackAgents(input: {
  from: FallbackCandidate
  candidates: FallbackCandidate[]
  isPoolSpent: (candidate: FallbackCandidate) => boolean
}): FallbackCandidate[]
```

`candidates` arrives in declaration order and is the project's `ready` agents.
`isPoolSpent` is supplied by the caller because the answer needs the adapter,
which `src/shared` must not reach.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { rankFallbackAgents, type FallbackCandidate } from '../../src/shared/agent-fallback'

const agent = (agentId: string, providerId: string, modelId: string, accountId: string): FallbackCandidate =>
  ({ agentId, providerId, modelId, accountId })

// The owner's real project, in declaration order.
const all = [
  agent('anti-gemini-flash', 'antigravity', 'gemini-3.6-flash-high', 'bdg'),
  agent('anti-claude-opus', 'antigravity', 'claude-opus-4-6-thinking', 'bdg'),
  agent('anti-claude-sonnet', 'antigravity', 'claude-sonnet-4-6', 'bdg'),
  agent('bs', 'openai', 'gpt-5.6-sol', '90vn'),
  agent('lcott', 'openai', 'gpt-5.6-sol', 'lcott'),
  agent('ernandez', 'openai', 'gpt-5.6-sol', 'ernandez'),
  agent('terra', 'openai', 'gpt-5.6-terra', 'bdg')
]
const rank = (fromId: string, spent: (c: FallbackCandidate) => boolean = () => false) => {
  const from = all.find(candidate => candidate.agentId === fromId)!
  return rankFallbackAgents({ from, candidates: all, isPoolSpent: spent }).map(c => c.agentId)
}

describe('rankFallbackAgents', () => {
  it('prefers the same model on another account', () => {
    expect(rank('bs').slice(0, 2)).toEqual(['lcott', 'ernandez'])
  })

  it('takes the same provider before another provider', () => {
    const order = rank('bs')
    expect(order.indexOf('terra')).toBeLessThan(order.indexOf('anti-gemini-flash'))
  })

  it('never offers the agent that was refused', () => {
    expect(rank('bs')).not.toContain('bs')
  })

  it('drops a candidate whose pool is spent', () => {
    // anti-claude-opus is a different model on the same exhausted claude-gpt
    // pool, so it is not an alternative at all. Without this it would be tried
    // and earn a 429 that was predictable.
    const spent = (c: FallbackCandidate) => c.modelId.includes('claude')
    expect(rank('anti-claude-sonnet', spent)).toEqual(['anti-gemini-flash', 'bs', 'lcott', 'ernandez', 'terra'])
  })

  it('keeps declaration order inside a tier', () => {
    expect(rank('bs').slice(0, 2)).toEqual(['lcott', 'ernandez'])
  })

  it('returns nothing when there is no one else', () => {
    const only = all[3]
    expect(rankFallbackAgents({ from: only, candidates: [only], isPoolSpent: () => false })).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run tests/unit/agent-fallback-rank.test.ts
```

Expected: the module does not resolve.

- [ ] **Step 3: Implement**

```ts
// Ranked by how close a candidate is to the agent it replaces, not by how much
// quota it has. Quota only removes a candidate that cannot work.
function tier(from: FallbackCandidate, candidate: FallbackCandidate): number {
  if (candidate.providerId !== from.providerId) return 3
  return candidate.modelId === from.modelId ? 1 : 2
}

export function rankFallbackAgents(input: {
  from: FallbackCandidate
  candidates: FallbackCandidate[]
  isPoolSpent: (candidate: FallbackCandidate) => boolean
}): FallbackCandidate[] {
  return input.candidates
    .filter(candidate => candidate.agentId !== input.from.agentId)
    .filter(candidate => !input.isPoolSpent(candidate))
    .map((candidate, index) => ({ candidate, index, tier: tier(input.from, candidate) }))
    // Declaration order inside a tier: the trigger is exhaustion, so draining
    // one account before the next is right. Spreading would empty them together.
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(entry => entry.candidate)
}
```

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck
```

Expected: **1111**. Commit as `feat: rank fallback agents by closeness to the one refused`.

---

### Task 2: Let the loop be told who to call next

**Files:**
- Modify: `src/main/agent/loop.ts`
- Test: `tests/unit/agent-loop.test.ts`

**Interfaces:**
- Produces, on `LoopDeps`:

```ts
  /** Overrides llm, model and system for this step when present. */
  currentTarget?: () => { llm: LlmClient; model: string; system: string; variantOptions?: Record<string, unknown> } | undefined
  /** Returns true when another agent took over and the turn should continue. */
  handoff?: (message: string) => Promise<boolean>
```

- [ ] **Step 1: Write the failing tests**

Using the harness already in `tests/unit/agent-loop.test.ts`:

```ts
  it('continues the turn on a new target after a handoff', async () => {
    const second = { stream: async function* () { yield { kind: 'text', text: 'second' }; yield { kind: 'finish' } } }
    let swapped = false
    const h = makeHarness({
      currentTarget: () => swapped ? { llm: second, model: 'm2', system: 's2' } : undefined,
      handoff: async () => { swapped = true; return true }
    })
    h.llm.queue = [[{ kind: 'error', error: 'quota exhausted' }]]
    await h.runner.run()
    expect(h.events.some(event => event.type === 'error')).toBe(false)
    expect(h.text()).toContain('second')
  })

  it('ends the turn when no one takes over', async () => {
    const h = makeHarness({ handoff: async () => false })
    h.llm.queue = [[{ kind: 'error', error: 'quota exhausted' }]]
    await h.runner.run()
    expect(h.events.some(event => event.type === 'error')).toBe(true)
  })
```

Read the harness first; `makeHarness` may not accept extra deps yet, in which
case widen it rather than building a second harness beside it.

- [ ] **Step 2: Run to confirm failure**

Expected: the turn ends with an error in both cases.

- [ ] **Step 3: Implement**

Add the two fields to `LoopDeps`. Where the stream is opened, resolve the target
once per step:

```ts
        const target = this.deps.currentTarget?.()
        const stream = (target?.llm ?? this.deps.llm).stream({
          model: target?.model ?? this.deps.model,
          system: (target?.system ?? this.deps.system) + (this.deps.systemSuffix?.() ?? ''),
          messages: llmMessages,
          tools: isLastStep ? [] : this.visibleToolDefs(),
          signal,
          variantOptions: target?.variantOptions ?? this.deps.variantOptions,
          serviceTier: this.deps.serviceTier
        })
```

In both error paths, after `recoverFromOverflow` declines and before
`persistPartial()`:

```ts
            // Beside the overflow recovery that already lives here: another
            // agent may be able to carry the same turn.
            if (await this.deps.handoff?.(message)) { handedOff = true; break }
```

Follow the existing `overflowRetry` pattern for continuing the outer loop.

- [ ] **Step 4: Verify and commit**

Expected: **1113**. Commit as `feat: let a turn continue on a different target`.

Body must say the loop still does not know what an agent is: it asks who to
call, and something above answers.

---

### Task 3: The manager chooses and swaps

**Files:**
- Modify: `src/main/bs-agent-manager.ts`
- Test: `tests/unit/bs-agent-manager.test.ts`

- [ ] **Step 1: Extract the target from `runnerFor`**

`runnerFor` computes `llm`, `model`, `system` (from `resolved.systemPrompt`,
`modeNote`, `instructions`, `skillListText`) and `variantOptions`. Lift that into

```ts
  private targetFor(agentId: string): { llm: LlmClient; model: string; system: string; variantOptions?: Record<string, unknown> } | undefined
```

and have `runnerFor` call it, so one definition serves both. Do not duplicate the
system-prompt assembly: two copies would drift, and the second half of a turn
would be run under a prompt the first half was not.

- [ ] **Step 2: Write the failing tests**

```ts
  it('continues a turn on another agent when quota is refused', async () => {
    const { manager, events, llmModels } = await makeManager({
      partsQueue: [
        [{ kind: 'error', error: '[bs] [request-failed] (429): Individual quota reached' }],
        [{ kind: 'text', text: 'carried on' }, { kind: 'finish' }]
      ]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(true)
    expect(events.filter(event => event.type === 'error')).toEqual([])
  })

  it('does not hand over an auth failure', async () => {
    const { manager, events } = await makeManager({
      partsQueue: [[{ kind: 'error', error: '[bs] [request-failed] (401): Unauthorized' }]]
    })
    await manager.send('a1', 'go')
    expect(events.some(event => event.type === 'agent-fallback')).toBe(false)
    expect(events.some(event => event.type === 'error')).toBe(true)
  })
```

The harness registers two native agents already (`BS_AGENT`, `PTY_AGENT`); a
second *native* agent may need adding for a candidate to exist.

- [ ] **Step 3: Implement the selection**

Per running turn, keep the agent currently serving and the ids already tried:

```ts
  private turnTargets = new Map<string, { agentId: string; tried: Set<string> }>()
```

`handoff(message)`:
1. Classify with `classifyProviderError`. Anything but `quota-exhausted` or
   `capacity-exhausted` returns false.
2. Build candidates from `this.agents` filtered to `kind !== 'pty'`, the same
   `cwd`, and a `ready` assignment.
3. `isPoolSpent` resolves the candidate's account usage through
   `providerAccounts()`, finds its group by asking the provider adapter, and
   calls `poolState`.
4. `rankFallbackAgents`, drop anything in `tried`, take the first.
5. None left → false.
6. Otherwise record it, emit the notice, return true.

`currentTarget` returns `targetFor(current.agentId)` when the serving agent is
not the one the turn started with.

- [ ] **Step 4: Recompile the active turn neutrally after a handover**

`buildMessages` compiles prior turns neutrally and the active turn through
`toLlmMessages`. After a handover the active turn carries the previous
provider's tool call ids and `thoughtSignature`, which the next provider
refuses. When the serving agent has changed, compile the active turn through
`compileNeutralContext` as well.

- [ ] **Step 5: Verify and commit**

Expected: **1115**. Commit as `feat: hand a refused turn to the closest available agent`.

---

### Task 4: Say so in the transcript

**Files:**
- Modify: `src/shared/types.ts`, `src/renderer/src/components/chat/ChatPanel.tsx`
- Test: `tests/unit/ipc-contract.test.ts`

- [ ] **Step 1: Add the event**

```ts
  | { type: 'agent-fallback'; agentId: string; toAgentId: string; toAgentName: string; reason: string; pool?: string }
```

- [ ] **Step 2: Render it**

Reuse the `notice` feed item added in v1.1.6. The text names both agents and the
pool, because two agents on different models can share one pool —
`anti-claude-opus` and `anti-claude-sonnet` do — and without the pool the reason
reads as arbitrary.

- [ ] **Step 3: Check the contract test**

```bash
npx vitest run tests/unit/ipc-contract.test.ts
```

- [ ] **Step 4: Verify and commit**

Expected: **1115**, unchanged. Commit as `feat: report a fallback in the transcript`.

---

### Task 5: Documentation, verify, report

- [ ] **Step 1: Remove the dead fallback fields**

`fallback` on `AgentConfig`, `AgentSettings` and `AgentModelAssignment`. Nothing
reads them and nothing will.

- [ ] **Step 2: Mark A2 landed**

In `docs/design/00-goals.md`, mark A2 and note A3 is next. Describe the ranking
in `docs/design/03-providers.md` so it is findable without reading the spec.

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

This is the one that cannot be faked: send a turn on `anti-claude-sonnet`, whose
`claude-gpt` pool is genuinely spent. The turn should hand over to
`anti-gemini-flash` — **not** to `anti-claude-opus`, which shares the dead pool —
and finish, with a notice naming both agents and the pool.

- [ ] **Step 6: Report and stop**

Do not merge, tag, or push. Report all five tasks and wait.
