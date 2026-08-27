# The coordinator and the task exchange — design

Date: 2026-08-26
Branch: `feat/coordinator`
Group: A3 in `docs/design/00-goals.md`, execution mode 2, product goal 4

## What mode 2 is

One agent takes a command, analyses it, plans, assigns work to other agents and
reviews what comes back. It does not do the work itself. Each agent keeps its
own conversation; BS Coding carries task packets out and results back.

## This is two subsystems, and the spec says so

Goal 4 states the coordinator is **a new surface, deliberately separate from the
current chat frame**. That surface and the exchange underneath it are
independent enough to fail separately:

- **A3a — the exchange.** A delegate tool, the broker that runs it, and the
  coordinator's restricted tool set. Complete and testable on its own, and
  visible in the existing chat as ordinary tool calls.
- **A3b — the surface.** The separate frame goal 4 asks for: a place to give the
  coordinator a command and watch the workers.

**This spec covers A3a only.** A3b gets its own, because the exchange has to
exist before there is anything for a surface to show, and because building the
surface first would mean designing a window around a mechanism that has never
run.

Doing A3a inside the existing chat is not a contradiction of goal 4. It is how
the mechanism becomes observable before its own frame exists — the same reason
A1 shipped with a card change.

## What already exists

**Per-agent conversations.** `StoredSession` carries an `agentId`, every native
agent has a cached runner, and `send(agentId, text)` awaits a full turn on it.
The independent conversations mode 2 needs are already the normal case.

**Concurrency with the right shape.** `running` is keyed per agent, so two
delegations to different agents run at once and two to the same one queue. No
scheduler is needed.

**A delegation precedent.** `createTaskTool` builds a `SessionRunner` for an
anonymous subagent with a fixed prompt and a restricted tool list. The shape is
right; the worker is wrong. Mode 2 delegates to **the user's real agents**, which
have their own provider, account, model and persisted history.

**Tool restriction that already works.** `visibleToolDefs` filters by
`decidePermission(name) !== 'deny'`, and `rulesForMode('plan')` denies the write
tools. Plan mode does not ask the model not to write — it removes the tools from
what the model is shown.

That last one matters: the spec's requirement that the coordinator be prevented
from working rather than asked not to already has a working mechanism.

## Design

**A third mode.** `AgentMode` becomes `'build' | 'plan' | 'coordinate'`.
`rulesForMode('coordinate')` denies every write tool — the plan-mode set — and
denies `task` as well, since an anonymous subagent would be work done outside
the exchange. `delegate` is allowed only in this mode.

The coordinator keeps read, glob, grep, git, todowrite and `delegate`. It can
look, plan, assign and review. It cannot edit.

**The delegate tool.** Built in `runnerFor` beside the task tool, closing over
the manager:

```
delegate({ agent: string, task: string }) -> string
```

`agent` names one of the project's agents. The manager resolves the name, sends
the task into that agent's own conversation, awaits the turn, and returns the
worker's final assistant message as the tool output.

Failures come back as tool errors rather than exceptions: a worker that fails is
information the coordinator should act on, not a crash of the coordinating turn.

**No new transport.** The packet out is the tool input; the packet back is the
tool output. The exchange the owner described is the tool call itself.

**Visibility.** A delegation renders as a tool call card, and the worker's own
conversation records the full exchange under its own session, where it can be
opened and read like any other.

## Verification

1. `delegate` appears in the coordinator's tool list and in no other mode.
2. Write tools do not appear in the coordinator's tool list. Asserted through
   `visibleToolDefs`, not by reading the prompt.
3. `delegate` to a named agent runs a turn in **that agent's** session and
   returns its final message.
4. Two delegations to different agents run concurrently; two to the same agent
   serialise. Driven by the existing `running` set.
5. A worker that errors returns a tool error, and the coordinating turn
   continues.
6. Delegating to an unknown name returns a tool error naming the agents that do
   exist.
7. A coordinator cannot delegate to itself.
8. `npm test` and `npm run typecheck` pass.
9. In the app, an agent in coordinate mode assigns work to another agent, the
   worker's session shows the exchange, and the coordinator reviews the result.

## Risks

**The coordinator spends quota on every worker.** A plan that fans out to five
agents runs five turns. Nothing here limits that, and the quota surface is where
it becomes visible. Naming it rather than capping it: an arbitrary cap would be
a number nobody chose, which is the mistake debt item 1 recorded.

**A worker inherits none of the coordinator's context.** It receives a task
string and its own history, nothing else. That is the point — independent
conversations — but a coordinator that writes a terse task will get work done
against a different understanding than it had. The tool description says the
task must stand alone.

**Recursion.** A worker in coordinate mode could delegate onward. The first
version forbids it: `delegate` refuses when the target is itself in coordinate
mode, so the exchange is one level deep and cannot loop.

**Nothing cancels a fan-out.** Stopping the coordinator's turn does not stop
workers already running. They are separate turns on separate agents, and the
existing stop is per agent. Recorded rather than solved here.

## Out of scope

**The separate surface.** A3b.

**Choosing the worker automatically.** The coordinator names the agent. Ranking
by capability is a different problem from ranking by availability, which is what
A2 does.

**Sharing history between agents.** Each conversation stays its own.

## Success criteria

An agent in coordinate mode can assign work to another of the user's agents, get
the result back, and act on it — without being able to do the work itself, and
with each conversation kept separate and readable afterwards.
