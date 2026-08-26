# Agent fallback — design

Date: 2026-08-26
Branch: `feat/agent-fallback`
Group: A2 in `docs/design/00-goals.md`, execution mode 1

## Problem

When the running agent's quota is exhausted the turn ends with an error. The
user then picks another agent by hand and re-sends. On the owner's own account
this is a daily event: `claude-gpt` sits at 0% weekly while `gemini` on the same
account has 93.74% left, and three Antigravity agents are configured across
those two pools.

Mode 1 in `docs/design/00-goals.md`: the session carries an ordered list of
fallback agents, and when the running one is refused the next takes over and the
turn continues.

## What A1 already provides

A quota refusal is recorded under the pool that was refused, and `poolState` in
`src/shared/quota-pool.ts` answers whether a pool is spent — from a recorded
refusal or from the numbers the provider already reported. Fallback reads that
rather than discovering it again.

Also checked rather than assumed: **every agent in a project shares one `cwd`**.
Swapping agents mid-turn does not move the working directory, so tools keep
operating on the same tree.

## How the fallback is chosen

**Revised 2026-08-26, after this spec was first written.** The original design
had the user maintain an ordered list of fallback agents on the session. The
owner reconsidered and delegated the choice to BS Coding, ranked by how close a
candidate is to the agent being replaced.

This removes rather than adds: `StoredSession.fallbackAgentIds` is no longer
needed, and neither is any UI to maintain it. The handover mechanism below is
unchanged.

### The ranking

When an agent on provider P, model M, account A is refused, candidates are the
project's other agents whose assignment is `ready`, ranked:

| Tier | Candidate | Why it ranks here |
|---|---|---|
| 1 | Same provider, same model, different account | Identical behaviour; only the quota pool differs |
| 2 | Same provider, different model | Same transport and tool surface, different capability |
| 3 | Different provider | Largest behavioural change, so last |

Within a tier, the order the agents were declared in the workspace. That is
deterministic and visible, and it is right on its merits rather than merely
simple: the trigger is exhaustion, so using one account until it is spent and
then the next drains them in sequence. Spreading load across all of them would
exhaust them together instead.

A candidate whose pool `poolState` already reports as spent is dropped before
ranking, not tried and skipped. After A1 that answer is on disk before the turn
begins.

### Traced against the owner's real setup

```
antigravity / claude-opus-4-6-thinking   anti-claude-opus     pool claude-gpt (spent)
antigravity / claude-sonnet-4-6          anti-claude-sonnet   pool claude-gpt (spent)
antigravity / gemini-3.6-flash-high      anti-gemini-flash    pool gemini 93.74%
openai      / gpt-5.6-sol                bs                   openai-base
openai      / gpt-5.6-sol                a.lcottdustin6360    openai-base
openai      / gpt-5.6-sol                h.ernandezrob5612    openai-base
openai      / gpt-5.6-terra              bs-free-gpt-terra    openai-base
```

`bs` refused → tier 1 offers `a.lcottdustin6360` then `h.ernandezrob5612`, the
same model on other accounts. Tier 2 would offer `bs-free-gpt-terra`, tier 3 the
Antigravity agents.

`anti-claude-sonnet` refused → tier 1 is empty, no other agent runs that model.
Tier 2 offers `anti-claude-opus`, **which is dropped**: it draws on the same
exhausted `claude-gpt` pool. `anti-gemini-flash` is next and runs.

That second case is the whole argument for dropping spent pools before ranking.
Without it the turn spends a request to earn a 429 it could have predicted.

### What is removed

The `fallback` fields declared on `AgentConfig`, `AgentSettings` and
`AgentModelAssignment` go. Nothing has ever read them, and under this design
nothing will.

## Handover, and why it stays inside one turn

Two shapes were considered.

**Restart the turn on the fallback agent.** Simpler to write. Rejected: the turn
is the unit of undo and of the snapshot, so a turn served by two agents would
become two turns, and undoing "what just happened" would only undo half of it.
The user's message would also have to be re-sent.

**Continue the same turn with a different target.** The loop already re-reads
`this.deps.llm`, `this.deps.model` and `this.deps.system` on every step, and
`buildMessages` is already a callback. So the loop does not need to know that
agents exist — it asks who to call at each step, and the manager answers.

`LoopDeps` gains one optional field rather than four:

```ts
  /** Overrides the static llm/model/system for this step when present. */
  currentTarget?: () => { llm: LlmClient; model: string; system: string; variantOptions?: Record<string, unknown> } | undefined
```

and one hook on the error path, beside the `recoverFromOverflow` precedent that
already exists there:

```ts
  /** Returns true when another agent took over and the turn should continue. */
  handoff?: (message: string) => Promise<boolean>
```

The loop calls `handoff` only after `recoverFromOverflow` declines. If it returns
true the loop continues; the next step reads the new target and rebuilds its
messages.

## The context handed over

`buildMessages` compiles prior turns through `compileNeutralContext` and the
active turn through `toLlmMessages`. The active turn carries provider-specific
artefacts — Google `thoughtSignature`, OpenAI tool call ids — which the next
provider will refuse.

After a handover the active turn is compiled neutrally too. The machinery exists
and is tested; what changes is when it is used.

## Reporting

One line in the transcript naming both agents and the reason, following the
`narrated-tool-call` notice added in v1.1.6. A turn that quietly changes which
model answered is a turn the user cannot account for afterwards.

## Verification

1. A quota refusal hands over to the highest-ranked candidate whose pool is not
   spent, and the turn continues rather than ending.
2. The handover recompiles the active turn neutrally: no `thoughtSignature`, no
   provider tool call id reaches the second provider.
3. The ranking is asserted directly against the owner's real configuration:
   `bs` refused offers the two other `gpt-5.6-sol` agents before
   `bs-free-gpt-terra` and before any Antigravity agent.
4. A candidate on a spent pool is dropped before ranking, so no request is made
   to it — `anti-claude-sonnet` refused must land on `anti-gemini-flash`, never
   on `anti-claude-opus`.
5. When every candidate is spent the turn ends with an error naming what was
   tried, not a bare provider message.
6. A non-quota error — auth, invalid request — does not trigger a handover.
   Falling back on a malformed request would just repeat it elsewhere.
7. One turn, one `turnId`, one snapshot: undo after a handover reverts
   everything both agents did.
8. A project with one ready agent behaves exactly as today: nothing to hand
   over to, so the turn ends as it does now.
9. `npm test` and `npm run typecheck` pass.

## Risks

**The system prompt changes mid-turn.** An agent carries its own instructions, so
the second half of a turn is written under different guidance from the first.
This is inherent to falling back by agent, which is what the owner chose, and it
is the reason the handover is reported rather than silent.

**Tier 2 can be worse than tier 3.** Ranking by similarity means a same-provider
candidate is preferred over a different-provider one even when the second is
healthier. On the owner's setup that is right — `anti-gemini-flash` beats an
OpenAI agent when Antigravity's Claude pool dies, because it keeps the provider.
It would be wrong if the whole provider were degraded rather than one pool. The
pool-spent drop handles the common case; a provider-wide outage would still walk
tier 2 first.

**Two agents may share a pool.** `anti-claude-opus` and `anti-claude-sonnet` both
draw on `claude-gpt`, so neither can serve as the other's fallback. The drop
before ranking handles it, but a user reading their agent list would not see it:
two entries that look like alternatives are one. The handover notice names the
pool for that reason.

**A tool call may be in flight.** A refusal arrives between steps, not during a
tool execution, because the tool runs after the model returns. Handover happens
at a step boundary, which is the only place the loop reads its target.

**Endless handover.** The candidate set is the project's agents, finite, and each
is tried at most once per turn. A refusal from the last ends the turn.

## Out of scope

**Mode 2, the coordinator.** That is A3.

**Ranking by remaining quota or by cost.** The tiers rank by similarity to the
agent being replaced, not by how much quota a candidate has. Quota only
excludes a spent candidate; it never reorders the rest.

**Falling back to an agent outside the project.**

## Success criteria

A turn whose agent runs out of quota continues on the closest available agent,
on the same turn, with a history the new provider can read, and says so in the
transcript.
