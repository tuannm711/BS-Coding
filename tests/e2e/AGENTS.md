# AGENTS.md — tests/e2e

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

Playwright end-to-end smoke tests that launch the real Electron app (`_electron.launch({ args: ['.'] })`)
with a temp `BS_USER_DATA`. Run after `npm run build` via `npm run e2e`; single file:
`npx playwright test tests/e2e/<file>.spec.ts`.

## Key files

| File | Responsibility |
|---|---|
| `smoke.spec.ts` | App launches, sidebar/status-bar (incl. version), native chat panel sends a message, settings connects a provider + syncs models. |
| `prompt.spec.ts` | Permission prompt: click allow, keyboard `1`, prompt spans pane width. |
| `context-footer.spec.ts` | Context footer shows real token usage, persists across reload, resets on new session; danger state past auto-compact threshold. |
| `chat-scrollbar.spec.ts` | Chat feed scrollbar reflects the full transcript (no content-visibility collapse). |
| `trace-panel.spec.ts` | Trace panel shows agent trace events. |
