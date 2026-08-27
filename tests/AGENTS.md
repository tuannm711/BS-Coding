# AGENTS.md — tests

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

- `unit/` — test logic thuần (Vitest, environment `node`). Một file cho một module: `<name>.test.ts`.
- `integration/` — test tích hợp thật: `pty-manager.test.ts` (ConPTY), `agent-stream-overlap.test.ts`,
  `browser/bridge-flow.test.ts`.
- `e2e/` — Playwright cho Electron, smoke test mở app.
- `fixtures/` — fake CLI (`echo-agent.js`) spawn thay agent thật + `mock-lsp-server.js`.
