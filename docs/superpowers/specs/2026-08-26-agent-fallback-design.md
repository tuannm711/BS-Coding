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

## Where the list lives

On the session, not the agent. `StoredSession` already carries `lastAgentId` —
the agent doing the work — and gains `fallbackAgentIds?: string[]` beside it.

The three `fallback` fields declared on `AgentConfig`, `AgentSettings` and
`AgentModelAssignment` are removed. They have never been read by anything, and
they describe the wrong owner: the same agent may want different backups
depending on the work.

**The order is the user's and is never reordered.** The system may skip an entry
it knows is dead, which is not the same thing — it follows the order and passes
over an option that would certainly fail. It never promotes a later entry over
an earlier one that could work.

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

## Skipping a pool already known to be spent

At turn start, and at each handover, an agent whose pool `poolState` reports as
exhausted is passed over without a request. Spending a request to earn a
predictable 429 is the cost this avoids, and after A1 the answer is already on
disk before the turn begins.

This is deliberately not the automatic selection the owner rejected. It removes
options that cannot work; it does not choose among options that can.

## Reporting

One line in the transcript naming both agents and the reason, following the
`narrated-tool-call` notice added in v1.1.6. A turn that quietly changes which
model answered is a turn the user cannot account for afterwards.

## Verification

1. A quota refusal on the running agent hands over to the first fallback whose
   pool is not spent, and the turn continues rather than ending.
2. The handover recompiles the active turn neutrally: no `thoughtSignature`, no
   provider tool call id reaches the second provider.
3. An agent whose pool is already spent is skipped at turn start, without a
   request being made.
4. When every fallback is spent the turn ends with an error naming what was
   tried, not a bare provider message.
5. A non-quota error — auth, invalid request — does not trigger a handover.
   Falling back on a malformed request would just repeat it elsewhere.
6. One turn, one `turnId`, one snapshot: undo after a handover reverts
   everything both agents did.
7. A session with no fallback list behaves exactly as today.
8. `npm test` and `npm run typecheck` pass.

## Risks

**The system prompt changes mid-turn.** An agent carries its own instructions, so
the second half of a turn is written under different guidance from the first.
This is inherent to falling back by agent, which is what the owner chose, and it
is the reason the handover is reported rather than silent.

**Two agents may share a pool.** `claude-opus` and `claude-sonnet` both draw on
`claude-gpt`. A list of those two provides no fallback at all, and the skip in
section 6 will pass over both. The failure is then correct but may surprise;
the error names each agent it skipped and why.

**A tool call may be in flight.** A refusal arrives between steps, not during a
tool execution, because the tool runs after the model returns. Handover happens
at a step boundary, which is the only place the loop reads its target.

**Endless handover.** The list is finite and each entry is tried at most once per
turn. A refusal from the last entry ends the turn.

## Out of scope

**Mode 2, the coordinator.** That is A3.

**Choosing an agent by cost or quota level.** The order is the user's.

**Falling back across projects or accounts the user has not listed.**

## Success criteria

A turn whose agent runs out of quota continues on the next agent the user
listed, on the same turn, with a history the new provider can read, and says so
in the transcript.
