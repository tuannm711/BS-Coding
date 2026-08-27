# AGENTS.md — src/main/agent/mcp

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

Model Context Protocol support: connects to MCP servers configured in `bs.json`, lists their
tools, and exposes them to the Bs agent as `ToolDefinition`s alongside the built-in registry.

## Key files

| File | Responsibility |
|---|---|
| `manager.ts` | `McpManager`: `connect(servers)` (closeAll → per-server client), `getTools()`, `getStatus()`, `closeAll()` on dispose. Also defines `McpServerConfig` type + status shape. |
