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

> **Reversed on 2026-08-27.** The premise above is false. The loop takes
> `tools` from the agent whose turn it is and never from the serving one, so a
> handoff never changed the tool set — the sentence "a worker asked to carry a
> coordinating turn would do the work rather than assign it" describes
> something that could not happen. What a handoff did borrow was the serving
> agent's **system prompt**, which is a real problem and a different one: it is
> now not borrowed either, and the filter is gone.
>
> The filter also caused a fault of its own. Coordination became exclusive per
> project, so a coordinator had no same-mode candidate at all and its turn
> simply failed when quota ran out. See
> `docs/superpowers/specs/2026-08-27-agent-roles-design.md`.

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
was given, and to report back if it cannot, rather than redesigning it.

**Neither is enforcement**, and neither should be. Removing a tool is
enforcement — the model never sees the option. Nothing removes a worker's
ability to reason, and nothing should: a worker needs enough judgement to
notice that what it was told to do did not work, and to say so.

The line is between two kinds of thinking. **Whether it worked** is the
worker's, and reporting a failure is part of the job rather than a lapse from
it. **What should be done** is the coordinator's. A worker that hits a wall
stops and reports; it does not redesign its way around it, because the
coordinator holds the context that would make that judgement sound.

## 4. What a coordinator may reach, and why

Three choices were made when coordinate mode shipped and never put to the
owner. Reviewed here; one of them was wrong.

### git: denied outright was too blunt

`git` was denied because committing is doing the work. That is true, and it
threw away `git diff` with it — while reviewing results is the coordinator's
stated job.

The mechanism to separate them already exists. `decidePermission` receives the
tool's **input**, not just its name, and plan mode already uses that to deny a
writing bash command while allowing a reading one:

```ts
if (mode === 'plan' && toolName === 'bash') {
  const command = typeof input?.command === 'string' ? input.command : ''
  if (command && isWriteBashCommand(command)) return 'deny'
}
```

The `git` tool takes an `args` string and runs the argv directly. So a
coordinator gets git through an allowlist of read-only subcommands — `diff`,
`status`, `log`, `show`, `blame`, `ls-files`, `rev-parse`, `describe`,
`shortlog` — and nothing else. `commit`, `push`, `stash`, `checkout` and
`reset` stay impossible.

**One trap must be closed with it.** `git diff --output=<file>` writes a file.
Argv runs without a shell so `>` redirection is unavailable, but that flag is
real, so any argument containing `--output` is refused regardless of
subcommand.

### read, glob and grep: kept, and the reason is on the record

A coordinator could be denied these and told to have a worker investigate and
report. That works mechanically and is rejected.

`docs/technical-debt.md` item 6 records what happens when design is written
from a summary instead of from the code: two statements reached
`docs/design/` that were false, both wrong in the same direction. Its closing
line is *"Re-measure before planning from any summary, including this one."*

A worker's report **is** a summary. Requiring a coordinator to write a spec and
a plan from summaries rebuilds the exact trap this project already recorded.

The cost is real and is accepted: reading fills the coordinator's own context.
The alternative is that every spec it writes is a guess.

### task: stays denied, confirmed

An anonymous subagent is work done outside the exchange — invisible to the
coordination view, unrecorded as an assignment, and running under a fixed
prompt rather than one of the user's agents. A coordinator assigns through
`delegate` or not at all.

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
8. A coordinator may run `git diff`, `git status` and `git log`, and may not
   run `git commit`, `git push`, `git stash` or `git checkout`.
9. `git diff --output=x` is refused, because argv runs without a shell but
   that flag writes a file anyway.
10. `npm test` and `npm run typecheck` pass.

## Risks

**The git allowlist is a list, and lists go stale.** A read-only subcommand
nobody thought of is refused, which is the safe direction, and a writing one
that slips in is not — so the list only grows with evidence that a specific
subcommand is needed and safe.

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

**Making workers unable to reason.** Not possible with tools, not attempted with
claims, and not wanted: a worker that could not tell a failure from a success
would report neither.

## Success criteria

A coordinator, without being told, knows it coordinates, knows who it can assign
to and what each of them runs, and assigns work rather than doing it. A quota
refusal never moves a turn to an agent that cannot do it.
