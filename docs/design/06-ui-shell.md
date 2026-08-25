# UI shell

The window and everything framing the work: chrome, sidebar, panes, the right
panel, settings and the tray. The terminal inside a pane is in
`docs/design/04-terminal-panes.md`; the quota cards are in
`docs/design/03-providers.md`.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 18-31 | `src/renderer/src/App.tsx`, `PaneModel`, `src/renderer/src/components/TitleBar.tsx`, `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/components/RightPanel.tsx`, `src/renderer/src/components/chat/` |
| [Data flow](#data-flow) | 32-50 | `App.tsx`, `PaneModel`, `XtermHost`, `buffersRef`, `registerTerminal`, `ChatPanel` |
| [Types that carry it](#types-that-carry-it) | 51-60 | `PaneModel`, `ChatEvent`, `src/shared/types.ts`, `QuotaAccountUiState`, `src/renderer/src/components/quota/quota-view.ts` |
| [Design decisions](#design-decisions) | 61-95 | `getWindowChromeOptions`, `titleBarOverlay`, `tests/unit/window-chrome.test.ts`, `src/renderer/AGENTS.md`, `MainApp`, `app.setAppUserModelId` |
| [Known limits](#known-limits) | 96-102 | `docs/technical-debt.md` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/renderer/src/App.tsx` | State centre: workspaces, templates, the open runtime, and `PaneModel` per pane |
| `src/renderer/src/components/TitleBar.tsx` | Custom title bar where the native one is hidden |
| `src/renderer/src/components/Sidebar.tsx` | Projects and agents |
| `src/renderer/src/components/RightPanel.tsx` | Tab host for tree, artifacts and quota |
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

## Known limits

One window, one project open at a time. No router, no detachable panes.

The tray icon is the same asset on all three platforms; macOS wants a template
image — debt item 8 in `docs/technical-debt.md`.
