# AGENTS.md — src/shared

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

Hợp đồng dùng chung giữa main / preload / renderer.

- `types.ts` — data models thuần (Template, Workspace, AgentConfig, AgentState, GitStatus, ...).
  Chỉ JSON-serializable: **không** class, không function, không import Node/Electron.
- `ipc.ts` — `Channels` (mọi channel string) + `AgentApi` (interface API) + kiểu event payload
  (`PtyDataEvent`, `AgentStateEvent`, `GitStatusEvent`).
- `browser-types.ts` — types riêng cho browser bridge (pairing, snapshot).
- `text.ts` — helper text thuần (append stream delta, ...).
- `usage.ts` — helper tính context/token usage thuần.

## Các file chính

- `ipc.ts` — `Channels` + `AgentApi` + payload sự kiện. Hợp đồng giữa main và renderer.
- `types.ts` — kiểu miền dùng chung.
- `providers.ts` / `provider-state.ts` — capability, snapshot và trạng thái lỗi của provider.
- `remote-types.ts` — `RemoteStatus` và payload lệnh remote.
- `agent-selection.ts` / `openai-oauth.ts` / `text.ts` / `usage.ts` — helper thuần dùng chung.
