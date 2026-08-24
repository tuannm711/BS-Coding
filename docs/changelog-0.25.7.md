# Changelog — BS Coding v0.25.6 → v0.25.7

## 🚀 New Features

### Sidebar footer menu — version + update check
- Footer dropdown now shows the current app version and a **Check update** button that stays
  open while checking (button shows a loading spinner + disabled until the check finishes).
- When an update is available the existing **Update available** dialog opens; when already on the
  latest version a dialog reports *"Đây là phiên bản mới nhất"* with a Close button.
- Settings moved above Model Router in the footer dropdown.

### Settings cleanup
- **Remote Control** and **Templates** tabs are hidden from the Settings screen (backend unchanged).

### Provider and agent control room
- Connected provider accounts now appear as vertical dashboard cards with account-scoped code models, quota, lifecycle actions, and staged refresh results.
- Provider dashboards now show every provider-reported quota family as remaining capacity, retain last-known values when refresh fails, and keep long deduplicated model catalogs collapsed by default.
- BS-tracked usage now attributes requests, input/output tokens, and estimated cost to the exact provider account and model period.
- Agent provider, account, model, and speed assignments now persist exactly through Settings reopen and workspace restart; incompatible saved models remain visible for review.
- Chat quota cards now follow the live provider snapshot and update immediately when an agent model changes.
- Native Agents now share one chat frame; switching Agents changes the active session and quota without creating another chat pane.
- The Agent picker now renders above pane clipping, stays inside the viewport, supports keyboard navigation, and restores focus after closing.
- ChatGPT OAuth and Antigravity OAuth now use their own runtime transports without requiring an API key.
- OAuth credentials now rotate before model, usage, and chat requests; Antigravity authorization uses PKCE S256 and reconnect replaces the selected account in place.
- OAuth providers now create a visible authorization link without opening the browser; users can copy, explicitly open, cancel, or regenerate the time-limited link from the connection modal.
- GitHub Copilot now supports PKCE authorization, GitHub account discovery, Copilot entitlement validation, runtime-token refresh, and multiple connected accounts.

### Model Router removed
- Removed the entire Model Router feature (accounts manager, local gateway, routing, quota, logs).
- The **Model Router** menu item remains in the footer dropdown and opens a small **Coming soon** dialog.

## 🐛 Bug Fixes
- App: single instance lock — double-clicking the desktop icon restores the tray session instead
  of spawning a second process.
- Sidebar: footer dropdown opens upward so it stays inside the viewport.
- Providers: preserve remote model display names and capabilities instead of reducing model catalogs to IDs.
- Agents: stop replacing an unavailable saved model with the first model in the provider list.
- Antigravity: retry an expired OAuth token once, preserve Cloud Code quota reset data, and keep quota, capacity, cooldown, and authentication states distinct.
- Providers: preserve valid remote catalogs on transient discovery failures and prevent in-flight refreshes from reactivating or recreating removed accounts.
- Providers: roll back partial OAuth accounts when model hydration fails and preserve the previous account during failed reconnects.
- Agents: immediately reconcile Settings create/delete changes with the active workspace, preserve PTY Agents, fall back to `bs`, and stop orphaned Agent processes.

## 🧹 Internal & Docs
- Removed Model Router design spec + implementation plan.
- Removed connections (Claude/Codex login) and gateway backend; CLI agents now run with the
  machine's default configuration.
- Version bumped to 0.25.7.
- Added provider assignment migration, recovery guidance, and acceptance coverage for IPC, restart persistence, quota snapshots, staged refresh, OAuth runtime, and Cloud Code tools.
- Added provider-neutral authorization session contracts, loopback callback security tests, cross-provider OAuth fixtures, modal E2E coverage, and Agent workspace reconciliation tests.
