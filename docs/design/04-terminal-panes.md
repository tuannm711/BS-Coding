# Terminal panes

How a CLI coding agent gets a pty, how its output reaches the screen, and how it
is torn down without leaving orphans. This covers agents that run as external
processes; the native agent has no pty and lives in
`docs/design/02-agent-runtime.md`.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 18-28 | `src/main/pty-manager.ts`, `PtyManager`, `src/main/terminal-shell.ts`, `resolveShell`, `src/renderer/src/components/XtermHost.tsx`, `src/renderer/src/components/Pane.tsx` |
| [Data flow](#data-flow) | 29-46 | `PtyManager`, `proc.onData`, `MainApp`, `Channels.EventPtyData`, `PtyDataEvent`, `XtermHost` |
| [Types that carry it](#types-that-carry-it) | 47-58 | `PtySession`, `tree-kill`, `SpawnCommand`, `PtyDataEvent`, `TerminalExitEvent`, `src/shared/ipc.ts` |
| [Design decisions](#design-decisions) | 59-90 | `.exe`, `cmd.exe`, `buildSpawnCommand`, `.cmd`, `tree-kill`, `onExit` |
| [Known limits](#known-limits) | 91-98 | `resolveShell`, `cmd.exe`, `$SHELL`, `/bin/bash` |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `src/main/pty-manager.ts` | `PtyManager`: spawns, tracks and kills ptys; emits `data` and `exit` |
| `src/main/terminal-shell.ts` | `resolveShell`: the default shell for the platform |
| `src/renderer/src/components/XtermHost.tsx` | Mounts an xterm instance, wires input and resize |
| `src/renderer/src/components/Pane.tsx` | One agent's pane: header, terminal, state |
| `src/renderer/src/components/PaneGrid.tsx` | Lays panes out and handles zoom |
| `src/renderer/src/components/PaneHeader.tsx` | Per-pane controls: stop, restart, inject, zoom |

## Data flow

**Output.** `PtyManager` subscribes to `proc.onData` and re-emits a `data` event.
`MainApp` forwards it over `Channels.EventPtyData` as a `PtyDataEvent`. The
renderer's `XtermHost` writes the bytes straight into xterm. Nothing parses the
stream — it is a byte pipe from the child process to the terminal emulator.

**Input.** xterm's `term.onData` fires on every keystroke, the renderer sends it
through `window.api`, and `PtyManager` writes it to the pty.

**Resize.** `FitAddon` measures the container and xterm reports new dimensions;
the renderer calls through to `PtyManager.resize`, which resizes the pty so the
child program re-wraps.

**Exit.** `proc.onExit` emits an `exit` event carrying the code and whether the
session was an agent or a plain terminal. `MainApp` turns that into an agent
state change.

## Types that carry it

`PtySession` holds the process handle, the agent id, the pid, and the `kind`
(`agent` or `terminal`). The pid matters on its own because it is what
`tree-kill` needs, and on Windows it is not available immediately.

`SpawnCommand` is the `{ command, args }` pair actually handed to node-pty, which
is not always what the caller asked for — see below.

`PtyDataEvent` and `TerminalExitEvent` are declared in `src/shared/ipc.ts` with
the rest of the contract.

## Design decisions

**Non-`.exe` commands are wrapped through `cmd.exe` on Windows.**
`buildSpawnCommand` leaves a `.exe` alone and otherwise builds
`cmd.exe /d /s /c "<command> <args>"`, quoting arguments containing whitespace.
ConPTY cannot spawn a `.cmd` shim directly, and almost every npm-installed CLI —
`opencode`, `claude`, `aider` — is exactly that. Arguments are quoted by doubling
embedded quotes, the `cmd.exe` convention rather than the shell one.

**Stopping kills the tree, not the process.** A coding agent spawns children, so
killing the shell alone leaves them running and holding the workspace. `kill` from
`tree-kill` descends the process tree — `taskkill /T /F` on Windows.

**There is a second kill path for a pty that has no pid yet.** On Windows the pid
is populated only once ConPTY connects. Before that, `tree-kill` has nothing to
target, so the code falls back to node-pty's own `kill`, which signals the console
process group and therefore reaches console-attached children.

**Stop resolves after three seconds even if nothing exited.** An interactive shell
on POSIX may ignore SIGTERM. Without the timeout, a caller awaiting the exit event
would hang forever. The timeout force-kills, drops the session, and emits a
synthetic exit; the real `onExit` then no-ops because the session is already gone.

**No rebuild step runs for the native binding.** `@lydell/node-pty` ships prebuilt
N-API binaries — `prebuilds/win32-x64/conpty.node` — so `@electron/rebuild`
reports "No native modules found" and that is correct, not a misconfiguration. The
binding was verified loading under Electron 41.10.7 by spawning a shell from a
probe.

**The renderer never spawns anything.** Only main-process code may create a
process. The renderer asks; `PtyManager` acts.

## Known limits

`resolveShell` returns `cmd.exe` on Windows and `$SHELL` or `/bin/bash`
elsewhere. There is no per-workspace shell override.

Pane layout is a grid with zoom. There is no split-pane resizing or detachable
window.
