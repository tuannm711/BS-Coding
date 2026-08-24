# Changelog — BS Coding v0.25.7 → v1.0.0

## 🚀 New Features

### Standalone BS Coding release
- Establishes BS Coding 1.0.0 as a separate desktop product with its own application identity, release artifacts, profile migration, and update channel.

### Multi-account provider control
- Connects multiple provider accounts through descriptor-driven OAuth, API-key, or import flows and assigns an exact provider, account, code model, and speed to each Agent.
- Creates explicit OAuth authorization links that users can copy, open, cancel, or regenerate without exposing verifier or token data to the renderer.
- Presents provider accounts and shared quota data through compact account dashboards with model catalogs, refresh stages, reset windows, usage, and lifecycle actions.

### One chat session, multiple Agents
- Switches sequentially between Agents in one project chat while preserving a continuous transcript, context, todo list, usage totals, and undo/redo history.
- Keeps immutable Agent, provider account, and model attribution on historical turns and locks Agent switching while work is running or queued.
- Uses a compact Agent settings table with account-scoped model selection and a dedicated system-prompt editor.

## 📱 Mobile Remote Control — Coming Soon
- Continues development of secure pairing and synchronized remote control for BS Coding sessions.
- Stay tuned — mobile control remains under active development. 🚧

## 🐛 Bug Fixes
- OpenAI: routes ChatGPT OAuth through the Responses transport without requiring an API key and normalizes tool calls, outputs, and SSE decoding.
- Antigravity: uses account-discovered code models, refreshes stale Cloud Code context once, preserves the selected runtime model, and supports Gemini tool thought signatures.
- Agents: persists the exact selected account/model across Settings reopen and restart, removes duplicate workspace rows, and refreshes the chat picker after create/delete.
- Providers: preserves valid catalogs during partial refresh failures and prevents in-flight refreshes from reactivating or recreating removed accounts.
- Chat: maintains one-writer session ordering and displays quota/models for the currently selected Agent rather than a fixed model.

## 🧹 Internal & Docs
- Adds canonical provider snapshots, versioned Agent assignments, atomic migration backup, recovery guidance, and provider-neutral transport contracts.
- Adds unit, integration, and Electron E2E acceptance coverage for OAuth, refresh, assignment persistence, shared sessions, quota state, and provider chat routing.
- Sets the standalone BS Coding product baseline to version 1.0.0.
