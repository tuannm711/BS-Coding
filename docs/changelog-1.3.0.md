# Changelog — BS Coding v1.2.0 → v1.3.0

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🚀 New Features

### Fleet
- A third tab in the right panel, beside Files and Artifacts. The pinned *Session models* block above the tabs is gone; quota was stapled to the top of a file view it had nothing to do with.
- **Grouped by quota pool, not by agent.** `anti-claude-opus` and `anti-claude-sonnet` are different models drawing on one pool; in a flat list they read as alternatives, when exhausting one exhausts both.
- Every native agent in the project appears — including one with no ready assignment, and one whose model no reported pool claims. A roster that hides an agent is not a roster.
- Refresh and ChatGPT reset credits moved here with the cards.

### Live coordination
- The coordination screen is now a grid of real chats: the coordinator pinned left, and one full chat panel per worker it has assigned, each bound to the session that task ran in.
- Switching between Work and Coordination no longer tears down and rebuilds every pane, terminals included.
- The Work / Coordination control is always available. With no coordinator the screen says so and offers the one route to set one.

### Sessions in the sidebar
- Sessions sit under the open project, grouped into **Coordination** and **Work**, ordered by creation and holding still as they are used.
- A dot marks the session with a turn running in it.
- A session is marked *coordination* when a coordinator dispatches a task into it.

### Agent roles
- Each agent row carries two icon toggles across three states: coordinator, worker, no role. Neither control is ever disabled or hidden — pressing the lit one returns the agent to no role.
- One coordinator per project, enforced in the manager so it holds whichever surface asks.
- An agent with no role is not offered to the coordinator, and is available as fallback quota.

## 🐛 Fixes

### Sessions
- **Switching session no longer looks like the agent stopped.** Every write used to ask which session was current, so selecting another mid-turn sent the rest of that turn's output into it — and since the view filters by session, the one being watched fell silent. A turn now binds its session once, at the start.
- **Switching session took five to ten seconds.** The session store re-read and re-parsed the whole file on every call, then serialised it twice more to decide whether anything had changed. It holds the parsed sessions in memory now.
- Switching project paints as soon as the workspace is known, rather than waiting on three further round trips.

### Coordination
- A task given to a **busy** worker used to be folded into whatever that worker was already doing, with no turn of its own to await. It runs as its own turn.
- An assignment closed the moment its message was accepted into a queue, then reported the previous turn's answer as its result. It awaits the turn it started and reads only what that turn produced.
- A worker that ran its tools and wrote nothing is reported as **no reply**, with what it ran, rather than as a failure with no detail.
- **A delegated task no longer pushes the worker into a coordinating role.** The framing sentence did not match the skill exit that recognises dispatched work, so a worker loaded the whole process and reached a skill telling it to hand the work on — with nothing to hand it on with.
- The `task` tool is removed from a worker while it carries an assignment: an anonymous subagent runs outside the exchange, unrecorded and invisible.

### Fallback
- **A coordinator had no fallback at all.** Coordination is exclusive per project and candidates were filtered to the same mode, so its turn simply failed when quota ran out.
- A handoff borrows the serving account's endpoint, not its identity. The turn keeps its own tools, instructions and mode note — a plan-mode turn used to lose its read-only note the moment it moved to a build agent's account.

### Roles and quota cards
- **Two coordinators could be lit at once.** The demotion happened in memory and was never written to the workspace file or pushed to the window, so the panel showed both and a restart agreed.
- Fleet agents appeared under *No quota reported* rather than their pool: the provider sends no model list on its quota buckets, and matching on that alone placed everyone in the stray section.
- Quota cards fit the side panel: a three-line header that does not wrap, the provider's own paragraph moved to a tooltip, one speed toggle instead of two labelled buttons, and the account type shown as a badge.
