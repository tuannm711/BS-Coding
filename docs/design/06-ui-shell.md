# UI shell

The window and everything framing the work: chrome, sidebar, panes, the right
panel, settings and the tray. The terminal inside a pane is in
`docs/design/04-terminal-panes.md`; the quota cards are in
`docs/design/03-providers.md`.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 21-35 | `src/renderer/src/App.tsx`, `PaneModel`, `src/renderer/src/components/TitleBar.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/RightPanel.tsx`, `src/renderer/src/components/fleet/` |
| [Data flow](#data-flow) | 36-54 | `App.tsx`, `PaneModel`, `XtermHost`, `buffersRef`, `registerTerminal`, `ChatPanel` |
| [Types that carry it](#types-that-carry-it) | 55-64 | `PaneModel`, `ChatEvent`, `src/shared/types.ts`, `QuotaAccountUiState`, `src/renderer/src/components/quota/quota-view.ts` |
| [Design decisions](#design-decisions) | 65-99 | `getWindowChromeOptions`, `titleBarOverlay`, `tests/unit/window-chrome.test.ts`, `src/renderer/AGENTS.md`, `MainApp`, `app.setAppUserModelId` |
| [The coordination view](#the-coordination-view) | 100-152 | `src/renderer/src/components/coordinator/CoordinatorView.tsx`, `App.tsx`, `setMode`, `RightPanel`, `ChatPanel`, `listSessionTranscript` |
| [The fleet panel](#the-fleet-panel) | 153-211 | `RightPanel`, `buildFleet`, `ProviderQuotaGroup`, `modelIds`, `anti-claude-opus`, `anti-claude-sonnet` |
| [Sessions live in the sidebar](#sessions-live-in-the-sidebar) | 212-235 | `activeSessionId`, `groupSessions` |
| [Known limits](#known-limits) | 236-242 | `docs/technical-debt.md` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/renderer/src/App.tsx` | State centre: workspaces, templates, the open runtime, and `PaneModel` per pane |
| `src/renderer/src/components/TitleBar.tsx` | Custom title bar where the native one is hidden |
| `src/renderer/src/components/Sidebar.tsx` | Projects and agents |
| `src/renderer/src/components/RightPanel.tsx` | Tab host for files, artifacts and fleet |
| `src/renderer/src/components/fleet/` | `buildFleet` and the panel that renders it |
| `src/renderer/src/components/chat/` | The native agent's chat surface, 20 files |
| `src/renderer/src/components/settings/` | Settings dialog and its twelve tabs |
| `src/renderer/src/components/trace/` | Trace inspector, timeline and subagent tree |
| `src/main/window-chrome.ts` | `getWindowChromeOptions`: per-platform window frame |
| `src/main/tray-manager.ts` | `TrayManager`: tray icon, menu, hide-to-tray |

## Data flow

**State lives in `App.tsx`.** It holds workspaces, templates and the open
runtime, and derives a `PaneModel` per pane from the agent config, its state and
its git status. Panes are presentational; the state is one level up.

**Output can arrive before its terminal exists.** A pty starts producing bytes as
soon as it spawns, which may be before React has mounted the `XtermHost` for that
pane. `App.tsx` buffers into `buffersRef` and flushes when `registerTerminal`
runs. Removing that buffer loses the first lines of every agent.

**Chat is an event stream.** `ChatPanel` consumes the `ChatEvent` kinds described
in `docs/design/02-agent-runtime.md` and renders text, reasoning, tool cards,
prompts and diffs. Scroll behaviour is factored into `useChatScroll.ts` and
`chat-scroll-geometry.ts` rather than living in the component.

**The tray owns the app lifetime.** Closing the window hides to tray; only the
tray menu or Cmd+Q quits.

## Types that carry it

`PaneModel` is the per-pane view model: agent config, runtime state, git status.

`ChatEvent` from `src/shared/types.ts` is the only thing the chat surface knows
about the agent. The renderer has no access to the transcript store.

`QuotaAccountUiState` from `src/renderer/src/components/quota/quota-view.ts` is
the six-value state both quota surfaces render from.

## Design decisions

**The title bar is custom on Windows and Linux, native on macOS.**
`getWindowChromeOptions` hides the frame and supplies a `titleBarOverlay` on
Windows, insets the traffic lights on macOS, and drops the frame entirely on
Linux. Platform behaviour is decided in one pure function, which is why
`tests/unit/window-chrome.test.ts` can cover all four cases without a window.

**Animation is avoided on anything that updates continuously.** This is recorded
in `src/renderer/AGENTS.md` from a real profiling session over CDP, not from
taste: animations run on the UI thread, and combined with per-token re-renders
they produce visible stutter in the chat input. Streaming updates scroll
instantly; smooth scrolling is reserved for discrete one-off events.

**Scroll ownership is released when the user scrolls.** During a streaming
response the view follows the output until the user scrolls away, after which it
stops fighting them. The geometry is a pure module so the rule is testable
without rendering.

**Settings is one dialog with tabs, not a route.** Twelve tabs — agents,
providers, commands, MCP, permissions, templates, context, remote, updates — over
a single modal. The app has one window and no router; a settings route would
require both.

**The window claims the installed AppUserModelID on Windows.** `MainApp` calls
`app.setAppUserModelId` before creating the window, matching the id
electron-builder stamps on the shortcut. Without it Windows gives the taskbar
button a process-derived identity that does not match the pinned shortcut.

**The tray asset is generated, not hand-maintained.**
`resources/tray-icon.png` is a copy of `build/icons/32x32.png` produced by
`scripts/build-windows-icon.mjs`, with a test that fails if the two diverge. It
was allowed to drift a full rebrand behind once, which is what the test now
prevents.

## The coordination view

`src/renderer/src/components/coordinator/CoordinatorView.tsx` is a **top-level
view**, not a panel: `App.tsx` renders either the workspace panes or the board
inside `<main>`, switched from a **Work / Coordination** control in the title
bar.

**That control is always enabled**, including when no agent is coordinating.
It shipped disabled in that case, which was backwards: the view is where you
would go to find out why there is no coordinator, and it could not be reached
until one existed. With none, the board says so and offers one route — to
Fleet. Deliberately one: a picker on the board as well would be a second
control doing the same job, which is how a project came to have two
coordinators in the first place.

**The role is exclusive per project and given in Fleet.** `setMode` returns any
other coordinating agent in the same `cwd` to build, so `App.tsx` resolving the
coordinator with `find` is sound — the invariant lives in the manager, not in
the view. When it lived nowhere, that `find` silently picked one of two.

Putting **the board itself** in a `RightPanel` tab was rejected — it is a narrow
column beside the panes and would still sit inside the chat frame, which is the
thing goal 4 asks to leave. That is not contradicted by the fleet tab below:
Fleet is a roster you read while working, and the board is a surface you work
*in*. A second window was rejected too: a second lifecycle, state synced over
IPC and close/reopen handling, for a separation nothing has asked for.

The coordinator is pinned left; every worker it has given work to tiles the
rest, each a full `ChatPanel` bound to the session that task ran in.

**Sessions are one store keyed by cwd.** `listSessionTranscript` gates on
`store.listProject(projectPath)` and then reads `store.transcript(sessionId)` —
so a worker's session *is* a session of this project, and rendering it needs no
change to the session model. An earlier note here claimed the two were
different things and that Work therefore could not reach a worker's transcript.
That was false. What was actually missing was recording **which** session a task
ran in, which `CoordinationAssignment.sessionId` now carries.

**It shows a live chat per agent, and that reverses an earlier decision.** The
first version was a summary board — worker, task, state — on the stated
principle that tool cards and streaming belonged to the chat frame this surface
exists to be separate from. A test asserted their absence.

Use showed the principle was wrong. What goal 4 asked to leave was the
**single-agent chat frame**, not the detail. Stripped of the detail the screen
was a silent wait: nothing appeared between giving a command and its result,
and the only way to learn what a worker was doing was to open its own session
by hand. The principle and its test are gone.

`coordinationTiles` is a pure function over assignments and agents, so which
tiles exist — one per worker, newest first, a second task to the same worker
reusing its tile — is asserted without rendering a `ChatPanel`.

## The fleet panel

Controls belong at their scope. The product has three — app (providers, MCP,
permissions, updates), project (which agents, who coordinates, files,
artifacts), and agent or session (the conversation, its mode, its speed) — and
the shell had been mixing them wherever there was room.

`RightPanel` is the project surface, and it now has three equal tabs: **Files ·
Artifacts · Fleet**. The pinned *Session models* block above the tabs is gone;
quota is not a file view and was stapled to the top of one.

**Fleet groups by pool, not by agent.** `buildFleet` puts each agent inside the
`ProviderQuotaGroup` whose `modelIds` claim its model:

```
account → quota group (the pool) → the agents drawing on it
```

`anti-claude-opus` and `anti-claude-sonnet` are different models drawing on one
pool. Listed flat they read as alternatives — pick the other when the first is
spent — when exhausting one exhausts both. The account card already knew both
halves and rendered them apart; its `fleet` variant nests them.

Two kinds of agent are kept rather than dropped: a **stray**, configured for an
account but running a model no reported pool claims, and an **unassigned**
agent with no ready assignment at all. A roster that hides an agent is the
fault this panel exists to fix.

Fleet is also where the coordinator role is given, on the agent row, labelled
with who would lose it.

**The card is built for a 300px column.** Three things were costing the height
that made it unreadable there:

- **A description used as a label.** `bucket.description ?? bucket.label` in
  `antigravity-models.ts` put the provider's whole sentence — *"You have used
  some of your weekly limit…"* — where a label goes, three lines to state what
  the percentage beside it already stated. `label` now wins, and `description`
  is a field of its own, shown on hover.
- **Three lines per window.** The percentage, the bar and the countdown are one
  fact three ways. The row is now `label · countdown · %` over the bar, with
  the absolute timestamp in the tooltip.
- **Five controls on one agent row.** Name, model, role badge, take-the-role
  and two labelled speed buttons at 300px pushed the agent's own name out of
  view. Speed is one lit-or-unlit toggle, and taking the role appears on hover.

Refresh moved into the header as an icon for the same reason: a labelled button
in a footer costs a whole row to say what an icon says.

**Both rails are `--rail-width` and neither is draggable.** The right panel
could be widened to 600px, which took that space from the centre — and the
centre is where several live agent panes now sit at once. Fixed at the
sidebar's width — 279px — the card carries no horizontal slack, so the fleet variant
drops what the wider variants can afford: the Active badge, whose absence
carries it, and the plan name, which the account's own email already
identifies. Subscription expiry moves to the row's tooltip; freshness stays
visible, because a stale reading changes what the bars above it are worth.
The tab strip is 30px rather than 44 for the same reason.

## Sessions live in the sidebar

They were a dropdown inside the chat frame, which could answer neither *which
session is running* nor *what kind of work is in it*. They now sit under the
open project in the left rail, grouped.

**A session has a kind.** It becomes `coordination` when a coordinator
dispatches a task into it; everything else is work. Stored on the session and
carried through `normalize` — every read runs through there, so a field it
misses is a field that silently does not persist. Stored rather than re-derived
because two answers to one question is a mistake this project has already paid
for.

**A turn binds its session once, at the start.** Every write used to resolve
`activeSessionId` live, so selecting another session mid-turn sent the rest of
that turn's output into the newly selected one; the renderer filters events by
session, so the view being watched fell silent and the agent looked stopped. It
was never stopping. That binding is also what makes the running dot honest: the
session with a turn in it is the one the turn is bound to, whatever the user is
looking at.

`groupSessions` is a pure function, so the ordering and the dropping of empty
groups are asserted without a DOM.

## Known limits

One window, one project open at a time. No router, no detachable panes.

The tray icon is the same asset on all three platforms; macOS wants a template
image — debt item 5 in `docs/technical-debt.md`.
