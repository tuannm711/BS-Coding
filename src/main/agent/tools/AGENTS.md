# AGENTS.md — src/main/agent/tools

> Luật dự án ở [`/AGENTS.md`](/AGENTS.md). File này chỉ mô tả thư mục này, không đặt luật.

The tool registry for the native Bs agent. Each file exports a `ToolDefinition`
(`name`, `description`, `schema` (zod), `run`) — see `types.ts`. Tools are executed by
`SessionRunner` (`../loop.ts`) and permission-gated via `decidePermission` (`../permission.ts`).

## Key files

| File | Responsibility |
|---|---|
| `types.ts` | `ToolDefinition` interface + `ToolSchema` type — the contract every tool implements. |
| `registry.ts` | `createDefaultTools()` — the default tool map handed to `BsAgentManager`. |
| `bash.ts` | Runs shell commands (Windows: wraps via git-bash fallback; kills process tree on timeout). |
| `edit.ts` | Line-based file edit (old_string/new_string) with safety checks. |
| `write.ts` | Write/overwrite a file. |
| `read.ts` | Read a file (size-capped). |
| `apply-patch.ts` | Apply unified diff via `../apply-patch.ts`. |
| `glob.ts` | Glob file listing. |
| `grep.ts` | Text search with regex. |
| `git.ts` | Git operations (status/diff/commit...). |
| `question.ts` | Ask the user a question (blocks on `prompt-request`). |
| `todowrite.ts` | Persist a todo list for the session (`todo-updated` events). |
| `task.ts` | Spawn a subagent with its own LLM call (`createTaskTool`). |
| `revert.ts` | Revert files via snapshot store. |
| `skill.ts` | Load a skill into context. |
| `websearch.ts` / `webfetch.ts` | Web search / page fetch (need API keys). |
| `browser.ts` | Browser control via the Chrome bridge (navigate/click/read/...). |
| `office.ts` | Create/read/edit Office documents via the officecli CLI. |
| `lsp.ts` | LSP diagnostics for a file (via `../lsp/`). |
| `snapshot-util.ts` | Snapshot helpers for tools. |
