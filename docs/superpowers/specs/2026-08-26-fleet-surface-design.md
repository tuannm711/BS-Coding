# The fleet surface — design

Date: 2026-08-26
Branch: `feat/fleet-surface`
Depends on: `fix/coordinator-role-awareness` (unmerged at the time of writing)

## Problem

Four defects surfaced when the owner tested coordination in the app. They look
unrelated and are not:

1. The project had **two** agents in coordinate mode. `App.tsx` picked one with
   `find()`.
2. A worker was assigned work and never answered.
3. The coordination board showed nothing assigned.
4. The mode row overflowed its container.

(1) and (4) share a cause: **a project-scoped concept was put in an
agent-scoped control** because that control had room. (2) and (3) share a
different one: **`runAssignment` never observes the turn it starts.**

So this is two pieces of work — an arrangement problem and a correctness
problem — and the arrangement problem is the one that keeps recurring.

## Part one: where functions live

### The organising rule

The product has three scopes. Every control belongs to exactly one:

| Scope | Owns | Home |
|---|---|---|
| **App** | providers, accounts, MCP, permissions, commands, updates | Settings |
| **Project** | which agents exist, who coordinates, files, artifacts | right panel + shell |
| **Agent / session** | the conversation, its working mode, its speed | the chat frame |

Measured against that rule, five things are in the wrong place. This spec moves
three of them and records the other two as deliberately deferred.

### 1. `Coordinate` leaves the mode row

`ChatPanel.tsx:851` renders `mode` with three buttons, then a hint, then the
agent picker and speed control, on one line. It overflows because it is doing
four jobs.

But adding `flex-wrap` would treat the symptom. Build and Plan answer *what is
this agent doing*; Coordinate answers *who directs this project*. The first is
a property of one agent's turn, the second is a property of the project.

**The mode row keeps Build and Plan.** Coordinate is set in Fleet.

This is not a demotion of coordinate mode — it stays a mode, exactly as the
owner decided. Only the control moves to the scope it belongs to.

### 2. The right panel gets a third tab, and loses its pinned block

Today `RightPanel` renders `RightPanelQuota` — headed *Session models* — pinned
above two icon tabs, Files and Artifacts. Quota is not a tab and not a file
view; it is stapled to the top of something it has nothing to do with.

**Three equal tabs: Files · Artifacts · Fleet.** The pinned quota block is
absorbed into Fleet rather than duplicated.

### 3. Agents get a home, and it is grouped by quota pool

There is no surface that lists a project's agents. The only list is the
`AgentPicker` dropdown inside the chat frame. An agent's model lives in
Settings, its mode in the chat row, its quota in the pinned block, its role
nowhere.

Fleet is that surface, and it is **not a flat list of agents**.

`buildQuotaRows` already groups by `providerId/accountId` and already collects
the agents on each row. `ProviderQuotaGroup` already carries `modelIds`. The
grouping this needs is therefore available and unused:

```
account  →  quota group (the pool)  →  the agents drawing on it
```

**Why the pool is the grouping and not the agent.** `anti-claude-opus` and
`anti-claude-sonnet` are different models drawing on **one** pool. In a flat
list they read as alternatives — pick the other one when the first is spent. In
truth exhausting one exhausts both. Group A shipped `poolState` so the system
knows this; nothing shows it to the person.

```
FLEET                                          ODC Assistant

antigravity · nguyenminhtuan.bdg@gmail.com
  ▓▓▓▓▓▓▓▓▓░  gemini                  93%   6d 2h
      anti-gemini-flash                gemini-3.6-flash-high
  ░░░░░░░░░░  claude-gpt                0%   4d 4h    spent
      anti-claude-opus                 claude-opus-4-6-thinking
      anti-claude-sonnet               claude-sonnet-4-6

openai · nguyenminhtuan.90vn@gmail.com
  ▓▓▓▓▓▓▓░░░  codex                    69%   6d 8h    1 reset
      bs                    coordinates  gpt-5.6-sol
```

An agent whose account has no ready assignment still appears. `buildQuotaRows`
skips those today, and a roster that hides an agent is not a roster. Two cases,
and they are different:

- **configured but not ready** — it has an account, so it sits under that
  account, in a group labelled *no quota reported*
- **not configured at all** — no account to sit under, so it sits in a single
  **Unassigned** section at the foot of the panel

Both show the agent's name and mode; neither shows a bar, because there is no
measurement to draw.

### 4. The coordinator is one per project, and Fleet is where it is set

`App.tsx:288` resolves the coordinator as
`nativeAgents.find(agent => agent.mode === 'coordinate')`. Nothing made that
agent *the* coordinator; `find` picked it. Two coordinators sharing a project
would interleave assignments on the same workers with neither aware of the
other.

**Coordinate becomes exclusive within a project.** Setting it on one agent
clears it from whoever held it, back to `build`.

**Enforced in the manager's `setMode`, not in the view.** The manager knows each
agent's `cwd`; a rule enforced there holds no matter which surface calls it,
and there is no second copy to disagree.

Fleet marks the holder and is where the role is given.

### 5. The Coordination view stops being a dead end

`TitleBar` renders one Coordinate button, `disabled` when no agent coordinates.
That is backwards: with no coordinator you cannot reach the view, and the view
is where you would go to understand why.

**A two-way switch — Work · Coordination — always enabled.** With no
coordinator, the board says so and offers one action: open Fleet, where the
role is given.

Deliberately **one** picker. Fleet gives the role; the board does not offer a
second way to do the same thing.

### Deferred, and said plainly

**`Settings → Agents` still binds provider, model and account per agent** —
project-scoped configuration living in app-scoped settings. It belongs in Fleet
and is not moved here, because moving it means moving the account picker, the
model picker and the speed control with it, and that is its own piece of work.

**`Settings → Usage` is a report, not a setting.** Untouched.

## Part two: `runAssignment` never watches the turn it starts

```ts
await this.send(target.id, framed)
const last = [...this.listMessages(target.id)].reverse()
  .find(message => message.role === 'assistant')
assignment.state = last?.text ? 'completed' : 'failed'
```

Two independent faults, and the first is the one that produced the silence the
owner saw.

### `send` has no way to report back

```ts
if (this.running.has(agentId)) {
  q.push({ id: randomUUID(), text, images, displayText })
  this.emitQueue(agentId)
  return                       // <- returns before the turn exists
}
await this.runTurn(agentId, text, images, displayText)
```

When the worker is busy the message is queued and `send` resolves
**immediately**. `await send(...)` then means "the message was accepted", not
"the work is done". The assignment closes at once, reading whatever was already
in the transcript.

The earlier coordinator-surface spec asserted the opposite — *"`send` queues
when a turn is running, so the outcome is defined"* — which is true of the
queue and false of the return value. That sentence is why this was not caught.

**The fix belongs in the queue, not in `runAssignment`.** A queued message
carries a completion hook, resolved after **its own** `runTurn` returns:

```ts
interface QueuedMessage {
  id: string
  text: string
  images?: ImageAttachment[]
  displayText?: string
  // Resolved after this message's own turn finishes, so a caller that needs
  // the outcome can await the work rather than the acceptance.
  done?: () => void
}
```

`send` keeps its signature and its current meaning, because every other caller
wants exactly what it does now. A sibling — `sendAwaited(agentId, text)` —
resolves when the message's own turn has run, whether it ran inline or came off
the queue. `runAssignment` is its only caller.

**Every exit must resolve the hook**, or a coordinator waits forever:

- the queue is full and the message is refused
- the agent is removed while its message is queued
- `stop` clears the queue

A hook that is never called is indistinguishable, from the coordinator's side,
from a worker that is thinking.

### The result is read from the session, not from the turn

`listMessages` returns the worker's whole conversation. The last assistant
message may be from any earlier turn. A turn that errors appends nothing — so
the previous answer is returned and the assignment is marked **completed**.

That is worse than a wrong label: the coordinator reads a stale answer as this
task's result.

`ChatMessage.turnId` exists but is **optional** — it comes from
`executionForAgent(agentId)?.execution.turnId`, which is absent unless the agent
is in a shared execution. Keying on it would work in the tested case and fail
in the ordinary one.

**Use a boundary instead.** Record the worker's message count before the turn;
the result is the assistant text appended after it. No assistant text appended
means **failed**, which is exactly what an errored turn produces.

## Verification

Arrangement:

1. The mode row renders Build and Plan and no Coordinate button.
2. Setting an agent to coordinate returns any other coordinating agent in the
   same project to build; agents in another project are untouched.
3. Fleet groups agents under the quota group whose `modelIds` contain their
   model; two models sharing a pool appear under one bar.
4. An agent with no ready assignment still appears in Fleet.
5. Fleet marks the coordinator, and only one agent is ever marked.
6. The Work/Coordination switch is enabled with no coordinator, and the board
   offers the route to Fleet rather than a second picker.

Correctness:

7. A message sent to a busy agent resolves only after **its own** turn runs —
   asserted by ordering, not by elapsed time.
8. An assignment to a busy worker stays `running` until that worker's turn
   finishes.
9. An assignment whose turn errors is `failed`, even when the worker's
   transcript already holds an assistant message from an earlier turn.
10. `stop` on a coordinator resolves the hooks of queued worker messages rather
    than leaving assignments running forever.
11. A refused message (queue full) resolves its hook.
12. `npm test` and `npm run typecheck` pass.

## Risks

**Quota loses its always-visible slot.** It is one tab away instead of pinned.
The trade is that it stops being a block stapled above unrelated tabs, and it
gains the pool grouping. If the owner finds the extra click costly, the panel
can default to Fleet; not decided here.

**The pool grouping depends on `modelIds` being populated.** A provider that
reports groups with an empty `modelIds` yields agents with no home group —
which is why the unassigned bucket exists rather than dropping them.

**Exclusive coordinate changes an agent's mode without the user touching it.**
Giving the role away silently demotes another agent. Fleet must name which
agent lost it, in the moment.

**The completion hook is a new way to hang.** Every exit path resolving it is
the whole safety property, which is why four of the twelve checks are about
exits rather than the happy path.

## Out of scope

**Moving the model and account bindings out of Settings.** Recorded above.

**Persisting assignments.** Unchanged: in memory, for the reasons in the
coordinator-surface spec.

**Any change to the palette or the type scale.** The app's Studio Dark
direction — Bricolage Grotesque, Instrument Sans, JetBrains Mono, cool slate,
blue accent — is a deliberate identity and this work does not touch it. What is
being redesigned is where functions live, not how they look.

## Success criteria

A person can open one panel and see every agent in the project, what it runs,
which pool it drains, how much of that pool is left, and which one is
directing. A coordinator's assignment reflects the turn it actually started,
and closes when that turn does.
