# Native browser connection implementation

> Execute inline with superpowers:executing-plans and test-driven-development. User approved the written browser proposal by requesting implementation on 2026-10-01.

**Goal:** Replace the production localhost WebSocket bridge with Native Messaging while retaining authenticated Chrome profiles and existing browser tools.
**Architecture:** MV3 extension → small platform launcher → framed Node helper running on the bundled Electron runtime → authenticated OS IPC → BrowserService. Main and extension bind commands/snapshots to agent sessions. No extra installed Node runtime is required.
**Stack:** Electron/TypeScript, Chrome MV3/debugger, Node net/stdio, Windows .NET Framework launcher, Unix shell launcher.
**Spec:** docs/superpowers/specs/2026-10-01-browser-connection-proposal.md

## Decisions and constraints

- Primary supported runtime verification: Chrome on Windows. Implement user registration/launcher paths for macOS/Linux and test their generated files; do not claim those browsers ran locally.
- Keep the current unpacked-extension distribution with a committed public manifest key for a stable extension ID. Chrome Web Store publication is separate.
- Native host name: com.bscoding.browser. Protocol version 1; product version remains 1.3.8. Node-only helper is bundled separately with esbuild; Windows launcher compiled by the OS/CI .NET Framework csc, Unix wrapper invokes the packaged Electron executable with ELECTRON_RUN_AS_NODE.
- Setup is an explicit UI action. Register only per-user Chrome Native Messaging host entries, no system-wide keys, no default-profile debugging flags, no cookie copying.
- Authenticated OS IPC uses a per-install random token stored under userData with restricted permissions, a stable per-user endpoint, strict host origin validation, and protocol/capability handshake. No TCP listener in native mode.
- Main knows independent profile clients, selected connection and session bindings. Native messages are bounded; artifacts flow extension→host at up to 8MiB. Commands host→extension stay below Chrome's 1MiB cap.
- Serialize complete commands while retaining one debugger attachment. Tab leases and snapshots are session-specific, refs include fresh snapshot generations, and missing tabs never fallback to active user tabs.
- Disconnect/timeout resolves pending commands with unknown-result errors; never replay mutations. Deadline/epoch checks prevent queued old commands from running after reconnect.
- Keep existing WS class as an isolated legacy implementation for tests/reference, without starting it in production. New extension does not probe ports or auto-fallback to WS.
- Browser tools preserve names; inject session owner through ToolContext. UI lets a user choose a connection and explicitly assign an existing tab to the current chat. Newly opened tabs belong to that session.
- Console/network events are from CDP on owned tabs only; no passive interception of every page's fetch/XHR.
- Preserve all uncommitted v1.3.8 fixes and .claude files. Remain on develop/v1; do not publish during implementation.

## Review focus

Wrong origin/token/version, multiple profile sockets, old results after reconnect, stale refs after navigation, queued commands past deadline, large screenshot frames, helper crashes/app-offline, user settings rollback, paths with spaces, and Stop cancellation must be exercised.

## Tasks

### 1. Framing, protocol and native helper

Files: shared/browser-native.ts, main/browser/native-framing.ts, browser-native-host/host.ts, browser-native-host/Launcher.cs, scripts/build-native-host.mjs, browser-extension/manifest.json.
- [x] Add failing framing/protocol/origin helper tests and execute them.
- [x] Implement bounded little-endian UTF-8 JSON framing, validated origin, IPC hello/auth and stdio forwarding without stdout diagnostics.
- [x] Build helper/Windows launcher and exercise actual framed child process → temporary IPC service; invalid origin and app-offline fail closed.

### 2. Main BrowserService and setup

Files: main/browser/service.ts, main/browser/native-install.ts, shared/browser-types.ts, shared/ipc.ts, preload/index.ts, main/index.ts, tools/browser.ts.
- [x] Add failing OS IPC handshake, independent clients, pending disconnect/timeout/epoch, session routing, native registration and tool-owner tests.
- [x] Implement selected connection, bounded pending requests, session binding, logs/artifact persistence, setup status and explicit per-user registration.
- [x] Preserve callback/tool IPC compatibility; verify IPC contract and service/helper integration.

### 3. Extension transport and ownership

Files: browser-extension/background.ts, session-routing.ts, popup.ts/html, content.ts, debug-session.ts if required.
- [x] Add failing session/tab/snapshot/queue tests and execute.
- [x] Connect via chrome.runtime.connectNative; negotiate version/epoch, reconnect on worker/app restarts, validate command/result envelopes and serialize operations.
- [x] Persist session tab assignments for worker reconnect; invalidate snapshots on navigation/detach/close; enforce unique refs and no active-tab fallback.
- [x] Capture console/network through CDP only on assigned tabs; preserve command actions and fail visibly on policy/DevTools restrictions.

### 4. UI, packaging and verification

Files: BrowserDialog, InstallGuideDialog, App, electron-builder.ts, build scripts, docs references/release notes and browser-native E2E.
- [x] Add explicit Install/Repair helper, connection chooser and current-chat tab assignment with safe error/loading states.
- [x] Package helper/launcher/extension for app startup and user updates without overwriting running helper files.
- [x] Run typecheck, full Vitest, build, Electron E2E, premium UI audit and native host packaged smoke.
- [x] Exercise Chrome with isolated test profile when available; document profile-specific live setup separately and report any unverified platforms.
- [x] Review final changes and address correctness findings before rebuilding v1.3.8 installers.

## Progress

Preflight: transport/auth protocol is consumed by helper, service and extension; command session owner must match tools and UI assignment IDs. Existing ToolContext.snapshotScopeId is the active shared session ID; fall back to task/agent ID for legacy tools. Existing v1.3.8 gates are 1,275 tests / 26 E2E before browser implementation.

Implemented inline with isolated helper/extension work and independent read-only review. Five P2 findings fixed in one review pass with RED→GREEN tests: corrupthelperrepair, browserconfigstartup isolation, hungqueue/debuggersetupteardown quarantine, multiple tab leases and portable runtime refresh. Added persistentprofiledisable. Gates: TypeScript/build PASS; 1,347 tests PASS plus opt-in realChromium PASS; 28 ElectronE2EPASS; strictUIaudit0findings. Localpackaging/packagedhost verification recorded in docs/evidence/2026-10-01-native-browser-verification.md. No publication.

Packaged verification complete: local Setup/Portable rebuild passed; packaged app version1.3.8 native transport/port0 verified; realChromium integration reran successfully using packagedElectron and packagedlauncher/helper. Registry testbackuprestored andtemporaryprofilecleaned. Everyrequiredstep complete. See native-browser-verification evidence.
