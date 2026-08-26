# Current work — fleet surface and coordination

Date: 2026-08-26
Branch: `feat/fleet-surface`, 14 commits, **not merged**
Tests: **1184 passing, 157 files**; typecheck and build clean
Rule in force: only one side branch may exist at a time, so this one must be
merged and deleted before the next is cut.

## Where to pick up

Five items are diagnosed and agreed but **not started**. They are listed in
"Next" below with the evidence already gathered, so none of it needs
re-deriving. The owner will say when to begin.

## What landed on this branch

**The assignment exchange actually observes its worker.**

`send()` resolves when a busy agent accepts a message into its queue, which is
right for every other caller and wrong for a coordinator reporting a result. It
had no way to tell "queued" from "finished". `sendAwaited` resolves after the
message's own turn; the completion hook lives in a map beside the queue, never
on `QueuedMessage`, because `emitQueue` sends that array over IPC and a function
field fails structured clone. Five exits settle it.

`takeSteers` drained the whole queue into the running turn, so a task given to a
busy worker was injected mid-turn into unrelated work rather than run as its
own. Assigned messages are no longer steerable.

`runAssignment` read the last assistant message in the worker's whole session,
so a turn that errored reported the previous turn's answer as its result and
called it completed. It now reads only what its own turn appended, using a
transcript boundary rather than `ChatMessage.turnId` — that field comes from
`executionForAgent(...)?.execution.turnId` and is absent unless the agent is in
a shared execution, so it passes under test and fails in ordinary use.

**One coordinator per project.** `setMode` returns any other coordinating agent
in the same `cwd` to build. The invariant is in the manager, so it holds
whichever surface calls it; when it lived nowhere, `App.tsx` picked one of two
with `find`.

**The fleet panel.** Third tab beside Files and Artifacts; the pinned *Session
models* block is gone. Grouped by **quota pool**, because `anti-claude-opus` and
`anti-claude-sonnet` draw on one pool and a flat list made them read as
alternatives. Agents with no ready assignment appear as unassigned; those whose
model no pool claims appear as strays.

**Coordinate left the chat mode row.** Build and Plan say what an agent is
doing; who coordinates is a property of the project, and mixing the scopes is
what produced two coordinators and an overflowing row. The role is given in
Fleet, labelled with who loses it.

**A delegated task no longer pushes the worker into a coordinating role.** The
owner's worker invoked two skills and stopped. The session showed why, and it
was the framing sentence. superpowers' `using-superpowers` opens with a
SUBAGENT-STOP block — *"if you were dispatched as a subagent to execute a
specific task, ignore this skill"* — and "Assigned by bs. Carry this out as
specified" matched none of it. The worker loaded the whole process, was told it
had no choice but to invoke an applicable skill, reached
`dispatching-parallel-agents`, and ended the turn with nothing written because
it has no delegate tool. The sentence now says it is dispatched to execute this
specific task, not to delegate or re-plan it, and must reply with the result.
Prompts are not enforcement, so `task` is removed from a worker while an
assignment is running on it.

**Coordination is a grid of live agent chats.** The coordinator is pinned left;
every worker it has given work to tiles the rest, each a full `ChatPanel` bound
to the session that task ran in.

## Two claims of mine that were false, and are corrected in the docs

**"No tool cards, no streaming detail."** I wrote that into the
coordinator-surface spec as the line keeping the board from becoming the chat
frame goal 4 asked to leave, and I put a test on it. Goal 4 asks to leave the
**single-agent chat frame**, not the detail. Stripped of the detail the screen
was a silent wait. The principle and its test are gone.

**"A worker's session and a project session are different things."** I used this
to justify not fixing the click-through. `listSessionTranscript` gates on
`store.listProject(projectPath)` and then reads `store.transcript(sessionId)` —
one store, filtered by cwd. A worker's session *is* a session of this project.
What was missing was recording which session a task ran in, now
`CoordinationAssignment.sessionId`.

## Not yet confirmed in the app

The owner has not verified the coordination grid. Four things to check:

1. Assigning work makes the worker's tile appear and stream immediately.
2. Two workers tile into two columns and run at once.
3. **Each tile scrolls inside its own box** rather than stretching the grid row.
   This is the least certain: a full `ChatPanel` inside a grid cell may make the
   height behave oddly.
4. The quota card at the new 279px rail width.

## Next — five items, diagnosed, not started

Agreed order: 3 and 4 first, then 1, then 2 and 5 together.

### 3. Switching session appears to stop the agent

It does not stop. `switchProjectSession` does
`this.activeSessions.set(session.lastAgentId, sessionId)`, and the runner
resolves the session on **every** append:

```ts
appendMessage: (msg) => this.deps.store.appendMessage(this.activeSessionId(agent.id), …)
appendTool:    (tool) => this.deps.store.appendTool(this.activeSessionId(agent.id), …)
```

So switching mid-turn sends the rest of that turn into the newly selected
session. The renderer filters events by session in `acceptChatEvent`, so the
view being watched goes silent. The agent is still running; its output landed
elsewhere.

**Fix:** a turn binds its session once at start and writes there until it ends,
whatever the user selects meanwhile.

### 4. Show which session is executing

Falls out of 3. Once a turn owns a session id for its whole life, the manager
can say which sessions have a running turn. No new mechanism, only exposure.

### 1. Switching project feels slow

Main is already off the critical path — tools, MCP, catalog and PTY start in
`prepareWorkspace` after the runtime returns. The renderer is the problem:

```
await openWorkspace → await listProjectSessions → await createProjectSession? → await listArtifacts → setRuntime(rt)
```

`setRuntime` is last, so nothing paints until three further IPC round trips
finish. Moving it up to just after `openWorkspace` paints the panes at once and
lets sessions and artifacts fill in.

### 2 + 5. Sessions move to the left panel, grouped and classified

One piece of work, because the grouping decides the classification. Replaces the
dropdown in the chat frame.

```
PROJECTS
  ODC Assistant V2                    ▾
    Coordination
       Khảo sát codebase…      ● running
    Work
       Sửa quota card
  BS Coding                           ▸
```

**Classification:** a session is `coordination` when a turn in it was started by
`delegate`, or when it belongs to the agent currently coordinating. Everything
else is `work`. Stored on the session rather than derived per read, so two
places cannot disagree — the mistake this project has already paid for once.

The running dot comes from item 4.

## Operational hazards hit this session

**Port 1305.** `npm run dev` fails with `EADDRINUSE` when a previous dev server
is still holding it — including one the user closed the window on. Check the
port before launching. This cost two failed launches, and the first went
undiagnosed because the launch was piped through `tail -3`, which cut the line
naming the error. Do not truncate the dev log.

**CRLF.** The working tree is CRLF. A python `str.replace` with `\n` in the
search string silently matches nothing; use the file's own line ending or the
Edit tool. Single-line searches work either way.

## Open, undecided

- `subagentModels` still overlaps agents-and-modes.
- Debt 12: `Settings → Agents` still holds per-agent provider/model/account
  binding — project-scoped configuration in an app-scoped dialog.
- Debt 13: fleet cards render no session telemetry.
