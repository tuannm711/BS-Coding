# The coordinator knows its role and its workers — design

Date: 2026-08-26
Branch: `fix/coordinator-role-awareness`

## Scope, and what was dropped from it

The owner first asked for a full redesign of the Agents settings — declaring
duties per agent, a coordinator/worker role in configuration, and explicit
allowed and forbidden task lists. On seeing that a configured `role` would
collide with the runtime `mode` and leave three concepts answering one question,
they dropped it. **Coordinate stays a mode.**

What remains is smaller and needs no configuration change at all, because
everything required is already known inside the manager:

1. Fallback must not hand a turn to an agent in a different mode.
2. A coordinator must know it is one, know who its workers are, and assign work
   without being asked to.
3. Workers execute; the coordinator does the analysis, design, spec and plan.

## 1. Fallback ignores mode, and always has

```ts
// bs-agent-manager.ts:1743
const candidates = [...this.agents.values()]
  .filter(agent => agent.kind !== 'pty' && agent.cwd === this.agents.get(agentId)?.cwd)
```

Nothing filters on mode. A worker refused for quota can be handed to the
**coordinator**, which has no write tools and cannot do the work. A coordinator
refused can be handed to a **worker**, which has no `delegate` tool and would do
the work itself instead of assigning it.

**This predates coordinate mode.** A build agent could already fall back to one
in plan mode, which is denied every write tool. Coordinate only made it obvious.

The fix is one rule, not a special case: **a candidate must be in the same mode
as the agent it replaces.**

## 2. Everything the coordinator needs is already known

```ts
this.modes.get(agentId)   // who is coordinating
this.agents.values()      // who shares this project
this.resolved.get(id)     // each agent's provider and model
```

`listWorkers` already uses all three — but only to validate a name the model
guessed, and to name the alternatives in an error after it guessed wrong. That
is a wasted round trip and it is why the coordinator waits to be told who to
use.

**Through `systemSuffix`, not `modeNote`.** `modeNote` is computed once when the
runner is built, and runners are cached per agent, so adding a worker or changing
someone's mode would leave the coordinator reading a stale roster.
`systemSuffix` is a getter resolved at each step and already exists for the
shared-session note; this is the second thing it is for.

The note tells the coordinator:

- that it is the coordinator, and that its working tools are removed rather than
  discouraged
- who the workers are, each with its provider and model, so it can match work to
  capability — `gemini-flash` and `claude-opus` are not interchangeable
- to assign by default, rather than waiting to be told
- that each worker sees only the task text and its own history, so a task has to
  stand on its own

## 3. The division of labour

For coding work the coordinator analyses, designs, writes the spec and the plan,
then assigns. Workers execute what they are given.

Two layers, and they are not equally strong:

**The coordinator's instructions** say to do the thinking itself and to write
each task as something to carry out rather than a problem to solve. This is the
layer that matters, because the shape of the task is what decides whether the
worker has to reason.

**A short framing on the delegated text** tells the worker to carry out what it
was given and report, rather than redesign it.

**Neither is enforcement.** Removing a tool is enforcement — the model never
sees the option. Nothing removes a worker's ability to reason, and this document
should not be read as claiming otherwise. The honest statement is that the
coordinator is instructed to leave nothing to reason about.

## Verification

1. A quota refusal on a build agent never selects a plan-mode or coordinate-mode
   candidate, and vice versa — asserted per mode, not only for coordinate.
2. A coordinator with no same-mode candidate ends the turn rather than handing
   work to a worker.
3. The coordinator's system text names every other native agent in its project
   with that agent's provider and model.
4. A worker in coordinate mode does not appear in another coordinator's roster.
5. The roster reflects an agent whose mode changed after the runner was built —
   the case `modeNote` would get wrong.
6. A non-coordinator's system text gains none of this.
7. A delegated task reaches the worker with the framing attached.
8. `npm test` and `npm run typecheck` pass.

## Risks

**The roster grows with the project.** Seven agents is a few lines; fifty would
be a wall of text in every request. Not solved here, and not capped either: a
limit would be a number nobody chose. Worth revisiting if a project ever has
enough agents for it to matter.

**"Do this by default" may over-delegate.** A coordinator told to assign rather
than wait may assign work that did not need an agent — reading one file, for
instance, which it can do itself. The instruction says to assign work that
needs writing or commands, not everything.

**The framing text appears in the worker's transcript.** It is a real message in
a real conversation and the user will see it. Kept to one sentence for that
reason.

## Out of scope

**Redesigning the Agents settings.** Dropped by the owner, for the reason above.

**`subagentModels`.** Still overlapping with agents-and-modes, still undecided,
and untouched here.

**Making workers unable to reason.** Not possible with tools, and not attempted
with claims.

## Success criteria

A coordinator, without being told, knows it coordinates, knows who it can assign
to and what each of them runs, and assigns work rather than doing it. A quota
refusal never moves a turn to an agent that cannot do it.
