# Process model

How BS Coding is split across Electron's three processes, and the contract that
lets them talk. This document covers the boundary itself — what each process may
touch, how a message crosses, and how the build keeps the split honest. What runs
*inside* each process belongs to the other design documents.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 18-32 | `src/main/index.ts`, `MainApp`, `src/preload/index.ts`, `AgentApi`, `window.api`, `contextBridge` |
| [Data flow](#data-flow) | 33-53 | `window.api`, `registerIpcHandlers`, `ipcRenderer.on`, `onX`, `AgentApi`, `Event*` |
| [Types that carry it](#types-that-carry-it) | 54-69 | `src/shared/ipc.ts`, `Channels`, `AgentApi`, `window.api`, `PtyDataEvent`, `AgentStateEvent` |
| [Design decisions](#design-decisions) | 70-98 | `src/shared`, `src/shared/AGENTS.md`, `Channels`, `AgentApi`, `registerIpcHandlers`, `tests/unit/ipc-contract.test.ts` |
| [Known limits](#known-limits) | 99-107 | `tests/`, `docs/technical-debt.md` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/index.ts` | `MainApp`: owns app lifecycle, window creation, state, and registers every IPC handler |
| `src/preload/index.ts` | Builds the `AgentApi` object and exposes it as `window.api` through `contextBridge` |
| `src/shared/ipc.ts` | The contract: `Channels` plus the `AgentApi` interface and every event payload type |
| `src/shared/types.ts` | Domain types both sides use — agents, sessions, providers, usage |
| `src/renderer/src/` | React UI. Reaches the main process only through `window.api` |
| `electron.vite.config.ts` | Three separate builds, one per process, with the `@shared` alias |

Only the main process may spawn or kill a process, touch the filesystem outside
the renderer sandbox, or hold secrets. The renderer has `nodeIntegration: false`
and `contextIsolation: true`, set in `src/main/index.ts`.

## Data flow

Two directions, and they are not symmetric.

**Renderer asks, main answers.** The renderer calls a method on `window.api`.
Preload turns it into `ipcRenderer.invoke(Channels.X, ...args)`. The handler
registered in `registerIpcHandlers` runs in the main process and returns a value,
which resolves the renderer's promise. Every such method is a request with a
reply.

**Main pushes, renderer subscribes.** For anything the renderer cannot ask for —
a pty writing output, an agent changing state, git status refreshing — the main
process calls `win.webContents.send(Channels.EventX, payload)`. Preload's
`subscribe` helper wraps `ipcRenderer.on` and returns an unsubscribe function, so
a React effect can clean up. Every `onX` method in `AgentApi` follows this shape
and returns `() => void`.

There are 147 channels. They are grouped by prefix — `workspace:`, `agent:`,
`provider:`, `chat:`, `file:`, `remote:`, `browser:` — and event channels are
named `Event*` in the `Channels` object regardless of their string value.

## Types that carry it

`src/shared/ipc.ts` declares three things:

- `Channels` — a frozen map from a symbolic name to a channel string. Nothing may
  hardcode a channel string; the map is the only place a name is written.
- `AgentApi` — the full surface the renderer sees. Preload implements it, and the
  renderer consumes it as `window.api`.
- Event payload interfaces — `PtyDataEvent`, `AgentStateEvent`,
  `GitStatusEvent`, `TerminalExitEvent`, `AgentConfigEvent`,
  `WindowMaximizedChangeEvent`, `ArtifactsChangedEvent` and the browser and
  remote ones.

`src/shared/types.ts` holds the domain types. Both processes import from
`@shared`, aliased in all three vite builds and in every tsconfig.

## Design decisions

**`src/shared` must not import Node or Electron.** It is compiled into the
renderer bundle, which has no Node integration. An import of `node:fs` there
would fail at runtime, not at build time, so the rule is stated in
`src/shared/AGENTS.md` and enforced by the renderer build failing to resolve the
module.

**Adding an IPC method touches four places, in order.** Channel into `Channels`,
method into `AgentApi`, handler in `registerIpcHandlers`, implementation in
preload. Skipping any one produces a mismatch that only appears at runtime, which
is why the order is written down rather than left to habit.

**The contract is tested, not merely typed.** `tests/unit/ipc-contract.test.ts`
asserts that every channel used by preload is declared in `Channels`, and that
event channel names map to the matching `AgentApi` method names. Types alone
cannot catch a channel string that exists in `Channels` but is never handled.
Sibling tests cover the provider and shared-session contracts.

**Three tsconfig projects, not one.** `tsconfig.node.json` covers main, preload
and shared; `tsconfig.web.json` covers renderer and shared; `tsconfig.extension.json`
covers the browser extension. Splitting them is what makes the "shared may not
import Node" rule checkable: shared is compiled twice, once with `types: ["node"]`
and once without.

**Agent state changes go through one function.** `MainApp.setState` is the only
writer, and it notifies the renderer only when a visible field changes — status,
exit code, alert. Without that filter every pty byte would trigger a state push.

## Known limits

`tests/` is included in no tsconfig project, so test files are never
typechecked — debt item 1 in `docs/technical-debt.md`. A fixture can drift from
the type it claims to model and the suite will stay green.

The renderer talks only to the main process. There is no direct renderer-to-
renderer channel, and no second window, so nothing needs one yet.
