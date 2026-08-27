# AGENTS.md — src/main/agent/lsp

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

Language Server Protocol support for the Bs agent: spawns language servers, tracks open
documents, and produces diagnostics text that the `lsp` tool feeds back into the agent context.

## Key files

| File | Responsibility |
|---|---|
| `manager.ts` | `LspManager`: owns clients per language, `diagnosticsText(filePath, text)` → summary string for the agent; dispose on shutdown. |
| `client.ts` | Single LSP client over stdio: initialize, open/change documents (`textDocument/didChange`), collect `textDocument/publishDiagnostics`. |
| `servers.ts` | Language server definitions (command + args per language id, e.g. typescript-language-server). |
