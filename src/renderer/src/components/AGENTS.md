# AGENTS.md — src/renderer/src/components

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

The React UI layer (renderer process). Everything the user sees: pane grid with per-agent
terminal/chat, sidebar, status bar, title bar, and dialogs. All data flows through `window.api`
(preload) — the renderer never touches Node/Electron directly.

## Key files

| File | Responsibility |
|---|---|
| `Pane.tsx` | A single agent pane: header + either `ChatPanel` (native agent) or `XtermHost` (PTY agent); background badge mode. |
| `PaneGrid.tsx` | Grid layout of panes (1 or 2 columns), zoom/focus state. |
| `PaneHeader.tsx` | Pane title bar: status dot, git info, menu (inject/log/stop/zoom/new-session/background/delete). |
| `Sidebar.tsx` | Left sidebar: workspace list, add/remove, templates, open in editor. |
| `StatusBar.tsx` | Bottom bar: workspace name, git branch, running count, app version (via IPC). |
| `TitleBar.tsx` | Custom window chrome (min/max/close) for frameless platforms. |
| `XtermHost.tsx` | PTY terminal host via xterm.js. |
| `EmptyState.tsx` | Shown when no pane is open (workspace vs. no-workspace hint). |
| `BackgroundPanel.tsx` | Lists background agents; open/stop them. |
| `UpdateDialog.tsx` | Auto-update status + install prompt. |
| `BrowserDialog.tsx` | Chrome bridge pairing + status UI. |
| `InstallGuideDialog.tsx` | Extension install steps for the browser bridge. |
| `AddAgentDialog.tsx` / `AddProjectDialog.tsx` | Creation dialogs. |
| `RightPanel.tsx` | Tab host for the file tree, artifacts and quota. |
| `RightPanelTree.tsx` / `RightPanelArtifacts.tsx` / `RightPanelQuota.tsx` | The three right-panel tabs. |
| `FileViewer.tsx` / `FileContextMenu.tsx` | Read-only file view and its context menu. |
| `quota/` | Quota cards and their shared view model — see `docs/design/03-providers.md`. |
| `trace/` | Trace inspector, timeline and subagent tree. |
| `chat/` | The native-agent chat UI — see its own AGENTS.md. |
| `settings/` | Settings dialog + tabs — see its own AGENTS.md. |
