# The coordinator surface — design

Date: 2026-08-26
Branch: `feat/coordinator-surface`
Group: A3b in `docs/design/00-goals.md`, product goal 4
Closes: `docs/technical-debt.md` item 11

## Problem

A3a made the exchange work. It runs inside the chat frame as tool calls, which
is how it became observable before it had a frame — but goal 4 asks for a
surface **deliberately separate from the current chat frame**, and a coordinator
whose work is only visible as collapsed tool cards is, in the owner's words,
running hidden.

## What is missing, and it is not only pixels

Three of the four things a coordination view needs already exist:

| Needed | Available |
|---|---|
| Who is coordinating | `mode === 'coordinate'` |
| Which workers are running | `AgentState` through `onAgentState` |
| What each worker produced | that worker's own session |
| **Which task went to whom** | **nothing aggregates it** |

The fourth is derivable after the fact — each `delegate` call sits in the
coordinator's transcript with its input and output — but not while it is
happening. Nothing links a call in flight to the turn running on the worker.

So the surface needs a record of assignments per coordinating turn. That same
record is what debt item 11 needs to stop a fan-out, so one piece of work closes
both.

## Approach

### A top-level view, not a panel

The window shows either the workspace panes or the coordination view. `App.tsx`
already holds the state and derives what the main area renders, so the switch
belongs there.

Rejected: a third tab in `RightPanel`, which is a narrow column beside the panes
and would still sit inside the chat frame — the thing goal 4 asks to leave. Also
rejected: a second window, which means a second lifecycle, state synced over IPC
and close/reopen handling, for a separation nothing has asked for.

### The assignment record

`BsAgentManager` keeps, per coordinating turn:

```ts
interface CoordinationAssignment {
  id: string
  coordinatorId: string
  turnId: string
  workerId: string
  workerName: string
  task: string
  startedAt: number
  finishedAt?: number
  state: 'running' | 'completed' | 'failed'
  result?: string
}
```

Written when `delegate` starts a worker and closed when it returns, and emitted
so the view follows live rather than polling.

**In memory, like `turnTargets`.** A restart loses the record, and the workers'
own sessions do not — they are persisted, and a finished assignment is
reconstructible from the coordinator's transcript. Persisting a second copy of
something already stored is how two copies come to disagree, which this project
has paid for once.

### Stopping a fan-out

`stop(coordinatorId)` also stops every worker with a running assignment for that
turn. Today Stop is per agent and a coordinator's Stop leaves its workers
running, which is debt item 11.

The stop is one level deep because delegation is: a worker cannot itself be
coordinating, so there is no tree to walk.

### What the view shows and does

The coordinator on one side: its recent messages, and an input to give it a
command without going back to the chat frame. Sending reuses `sendChat`, which
already exists.

The workers on the other: one row per assignment with the worker's name, the
task, the state, and the result when it lands. A row opens that worker's own
session, because the full exchange is there and does not need copying.

One Stop, for the coordinator and everything it started.

## Verification

1. The view lists an assignment as soon as the worker starts, not when it
   finishes.
2. An assignment moves to `completed` with the worker's result, or to `failed`
   with the error.
3. Stopping the coordinator stops every worker running for that turn — asserted
   through the manager, since this is the debt entry being closed.
4. Stopping does not touch a worker running for something else.
5. Sending a command from the view reaches the coordinator, and the view shows
   its reply.
6. The view is reachable only when the project has an agent in coordinate mode,
   and says so when it does not rather than rendering empty.
7. Assignments from a previous turn do not appear as running after a restart.
8. `npm test` and `npm run typecheck` pass.
9. In the app: give a coordinator a command that fans out to two agents, watch
   both rows, open one worker's session, and stop the fan-out mid-flight.

## Risks

**The record is in memory.** A restart mid-fan-out leaves workers running with
no view of them. They are ordinary turns in ordinary sessions and finish
normally; what is lost is the coordinator's account of them. Accepted rather
than solved, because the alternative is a second copy of data that already
exists.

**Two surfaces can drive the same agent.** The chat frame and this view can both
send to the coordinator. `send` queues when a turn is running, so the outcome is
defined, but a user with both open can surprise themselves. Not prevented —
hiding the agent from the chat frame would be a larger change than the confusion
warrants.

**Stop is best-effort.** Aborting a worker mid-turn leaves whatever it already
wrote to disk. That is true of Stop everywhere in this product; the snapshot and
undo machinery is what recovers from it, not the stop.

**The view could become a second chat.** It shows the coordinator's messages and
takes input, which is most of a chat frame. The line held here: no tool cards, no
streaming detail, no editing. To read the detail you open the session. If that
line moves, this becomes the thing goal 4 asked to separate from.

## Out of scope

**Editing an assignment, or reassigning it.** The coordinator decides.

**Persisting assignments.**

**A coordination view across projects.** One project at a time, like everything
else in the shell.

## Success criteria

A coordinator can be given a command, its assignments watched as they run, a
worker's session opened, and the whole fan-out stopped — from a surface that is
not the chat frame.
