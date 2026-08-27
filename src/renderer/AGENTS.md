# AGENTS.md — src/renderer

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

React renderer (không có quyền truy cập Node/Electron trực tiếp).

## Cấu trúc

- `index.html` + `src/main.tsx` — entry; render `<App>`; nếu thiếu `window.api` hiện fallback hướng
  dẫn (preload chưa nạp).
- `src/App.tsx` — trung tâm state: workspaces, templates, runtime đang mở; định nghĩa `PaneModel`
  (agent + state + git) cho từng pane.
- `src/components/` — `Sidebar`, `PaneGrid`, `Pane`, `PaneHeader`, `XtermHost`, `EmptyState`,
  `StatusBar`, `TitleBar`, `BackgroundPanel`, `AddProjectDialog`, `AddAgentDialog`, `UpdateDialog`,
  `BrowserDialog`, `InstallGuideDialog`, `chat/`, `settings/`.
- `src/styles.css` — dark theme coding, spacing theo thang 4px.
