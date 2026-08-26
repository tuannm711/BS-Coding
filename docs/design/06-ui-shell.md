# UI shell

The window and everything framing the work: chrome, sidebar, panes, the right
panel, settings and the tray. The terminal inside a pane is in
`docs/design/04-terminal-panes.md`; the quota cards are in
`docs/design/03-providers.md`.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 20-34 | `src/renderer/src/App.tsx`, `PaneModel`, `src/renderer/src/components/TitleBar.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/RightPanel.tsx`, `src/renderer/src/components/fleet/` |
| [Data flow](#data-flow) | 35-53 | `App.tsx`, `PaneModel`, `XtermHost`, `buffersRef`, `registerTerminal`, `ChatPanel` |
| [Types that carry it](#types-that-carry-it) | 54-63 | `PaneModel`, `ChatEvent`, `src/shared/types.ts`, `QuotaAccountUiState`, `src/renderer/src/components/quota/quota-view.ts` |
| [Design decisions](#design-decisions) | 64-98 | `getWindowChromeOptions`, `titleBarOverlay`, `tests/unit/window-chrome.test.ts`, `src/renderer/AGENTS.md`, `MainApp`, `app.setAppUserModelId` |
| [The coordination view](#the-coordination-view) | 99-137 | `src/renderer/src/components/coordinator/CoordinatorView.tsx`, `App.tsx`, `setMode`, `RightPanel`, `CoordinatorBoard`, `CoordinatorView` |
| [The fleet panel](#the-fleet-panel) | 138-168 | `RightPanel`, `buildFleet`, `ProviderQuotaGroup`, `modelIds`, `anti-claude-opus`, `anti-claude-sonnet` |
| [Known limits](#known-limits) | 169-175 | `docs/technical-debt.md` |
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

The board shows the coordinator's messages, an input, and one row per
assignment with its worker, task, state and result. A row opens that worker's
own session, because the full exchange is already there.

**What it does not show is the design.** No tool cards, no streaming detail, no
editing. Those belong to the chat frame this exists to be separate from, and a
test asserts their absence rather than trusting the boundary to hold.

`CoordinatorBoard` is split from `CoordinatorView` the way `StatsView` is split
from `StatsTab`: the presentational half takes props and can be rendered under
`environment: 'node'`.

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

## Known limits

One window, one project open at a time. No router, no detachable panes.

The tray icon is the same asset on all three platforms; macOS wants a template
image — debt item 5 in `docs/technical-debt.md`.
