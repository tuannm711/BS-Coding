# BS Coding v1.3.4 — release design

Date: 2026-09-22
Branch: `feat/v1-3-4` (off `develop/v1` @ 980fee7 = v1.3.3)
Owner decisions captured below; **§3+4 task-tool removal flagged for review.**

Seven independent work items. Each is its own phase in the plan; they share no
state beyond the version bump.

## Global constraints
- Product track **V1**; version bump **1.3.3 → 1.3.4** at release step only.
- Working tree is **CRLF**: use Edit/Write, never `sed -i`.
- `npm run typecheck` + `npm test` green before any item is considered done.
- Do not merge V2 code. Release via `develop/v1` → `release/v1` → tag `v1.*`;
  **release/v1's build.yml (tag-publish) must never be overwritten by a merge
  from develop/v1** (the v1.3.3 release hit this — guard it in the release step).

---

## Item 1 — Remove Model Router and Mobile Remote

**Model Router** is only a placeholder: `ModelRouterComingSoon` modal in
`src/renderer/src/App.tsx` (~L517), opened from the Sidebar footer menu
(`Sidebar.tsx` "Model Router", ~L280) via `onOpenModelRouter`/`showModelRouter`.
Remove the menu entry, the modal, and the state/prop wiring.

**Mobile Remote** is a subsystem. Remove:
- `src/renderer/src/components/settings/RemoteTab.tsx` and its tab in `SettingsDialog.tsx`.
- `src/main/remote/remote-relay-client.ts`, `src/shared/remote-types.ts`.
- Remote wiring in `App.tsx`, `Sidebar.tsx`, IPC channels/handlers in `index.ts`,
  and any remote settings in `BsSettings`.
- The "Mobile Remote Control — Coming Soon" note is dropped from future changelogs.

Keep the BrowserBridge/Chrome extension (separate feature, unrelated to mobile remote).

Deliverable: menu and settings no longer show Model Router or Mobile Remote;
typecheck clean with all references gone.

## Item 2 — Silent in-app update ("Install & restart")

Today `updater.ts:184` calls `autoUpdater.quitAndInstall()` (defaults:
`isSilent=false`), which shows the NSIS installer window because
`electron-builder.ts` nsis is `oneClick:false`.

Target: the Update dialog's install button runs the update **silently and
restarts immediately** — no installer window.

- `updater.ts`: call `autoUpdater.quitAndInstall(true, true)` (isSilent,
  isForceRunAfter).
- `electron-builder.ts` nsis: switch to a silent-capable install —
  `oneClick: true` (or keep assisted but ensure `quitAndInstall(true,…)` runs
  the embedded updater silently). Verify differential/blockmap updates still
  produced and Windows code-signing (Azure Trusted Signing) still applies.
- Keep the in-app download+progress that already exists (`autoDownload=false`,
  `download-progress`, `update-downloaded`).

Risk: changing nsis mode affects the first-install UX too; confirm acceptable
in the plan's manual check. macOS/Linux flows unchanged.

## Item 3 + 4 — Remove the sub-agent role settings and the `task` mechanism

Scope confirmed by owner: remove the **"Sub-agent model overrides"** settings
section (`AgentsTab.tsx` ~L233: roles `research`/`general`/`reviewer` mapped to
models). The coordinator/`delegate` coordination group is **kept**.

**⚠ For review:** the approved approach also removes the `task` sub-agent
*mechanism* (each agent independent, coordination replaces sub-agents). If the
owner wants only the settings surface gone with `task` kept running on a default
model, that narrows this item. Proceeding as: remove the mechanism.

Remove:
- `AgentsTab.tsx` sub-agent section + `subagentModels`/`onChangeSubagentModels`
  props and their wiring in `SettingsDialog.tsx`.
- `subagentModels` from `BsSettings` (`src/shared/types.ts:509`) and
  `SubagentType` (`:512`), plus `BsConfig` and `config.ts` normalization.
- The `task` tool (`src/main/agent/tools/task.ts`) and its registration in the
  tools factory; any `subagentModels` reads in the agent runtime.
- Sub-agent surfaces in trace (`trace/SubagentTree.tsx` and its use in
  `TracePanel`/`TraceLedger`) — or reduce to nothing if they only served `task`.

Keep: `delegate` tool, coordinator/worker roles, Fleet, Live coordination.

Deliverable: Settings › Agents has no sub-agent role section; no agent is
main/sub by default; typecheck + tests green after removals (adjust/remove tests
that asserted `task`/subagentModels).

## Item 5 — Fix Antigravity detection (GUI app, not CLI)

Antigravity is a VS Code-fork GUI app, not a CLI: installed at
`%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe`, no working `--version`
(its `bin/` is empty). The exe's FileVersion is the real version (measured
2.15.1; the old hardcoded UA said 1.20.5).

Generalise `src/main/providers/identity/client-identity.ts` to two detector
kinds:
- **CLI** (Codex): unchanged — `exec('codex --version')`, parse semver.
- **GUI app** (Antigravity): locate the install (known path(s) under
  `%LOCALAPPDATA%\Programs\antigravity\`, plus PATH/registry as available) and
  read the exe's FileVersion via a Windows version-info query. Build identity
  `antigravity/<fileVersion>`.

`detectAntigravityIdentity()` returns `installed:true` with the real version
when the exe is found; the OAuth method un-hides as designed. Keep the borrowed
identity honest (real installed version). Cross-platform lookups (mac
`/Applications/Antigravity.app`, Linux) are structured for later but Windows is
the target now.

Deliverable: on a machine with Antigravity installed, its sign-in method appears
and the transport UA carries the real installed version.

## Item 6 — DeepSeek preset + Custom API provider

`llm.ts` already supports DeepSeek (`isDeepSeek`); the compatible-provider list
in `index.ts:230` lacks it.

- **DeepSeek preset:** add `['deepseek', 'DeepSeek', true]` to `compatibleProviders`
  (api-key), pointing at DeepSeek's base URL so it works out of the box.
- **Custom API provider:** a provider entry that lets the user enter a **name +
  base URL + API key** for any OpenAI-compatible endpoint. Surface it in Add
  Provider (a `custom` method with `name`/`baseUrl`/`apiKey` fields), stored and
  routed through the existing `openai-compatible` transport / `createLlm` generic
  path.

Deliverable: Add Provider shows DeepSeek and a Custom API option; connecting each
yields a working api-key account with tools.

## Item 7 — `/compact` slash command (action, not prompt)

System commands are dispatched in `bs-agent-manager.ts runCommand` (see
`commands.ts:27`); the compaction routine is `compactTranscript(deps)` in
`src/main/agent/compact.ts:232`.

Add a built-in `/compact` command whose execution, in `runCommand`, calls
`compactTranscript` for the agent's active session instead of injecting a prompt.
Register it beside the existing built-ins in `commands.ts`. It reports the
result (e.g. a system line) the way other system commands do.

Deliverable: typing `/compact` compacts the current session's context on demand;
a unit test covers the dispatch calling the compaction path.

---

## Out of scope (release mechanics, at the end)
Bump `1.3.3 → 1.3.4`, write `docs/release-notes/v1.3.4.md`, merge
`develop/v1` → `release/v1` **preserving release/v1's tag-publish build.yml**,
tag `v1.3.4`, let CI publish, verify.

## Self-review
- Placeholders: none; every item names concrete files and the decision.
- Consistency: `client-identity` two-kind model (§5) matches the Codex path kept
  from v1.3.3; `/compact` reuses the existing system-command dispatch (§7).
- Open scope point: §3+4 task-tool removal, flagged for the owner at review.
