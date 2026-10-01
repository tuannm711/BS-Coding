# Native Messaging browser connection — 2026-10-01

## Delivered

- Production main now starts BrowserService on OS IPC rather than the legacy TCP/WS bridge.
- Chrome extension connects through a stable-ID Native Messaging host with protocol/capability handshake, per-install credentials and exact origin validation.
- Helper ships with the app and runs on Electron's bundled Node runtime. Windows has a compiled launcher; Unix uses a generated wrapper. No separately installed Node is required.
- Profiles and session bindings are independent/persisted. Existing tabs require explicit assignment; session-created tabs remain leased while one is selected as default. There is no active-tab fallback. Disable profile prevents automatic reconnect until enabled.
- Whole commands serialize across the single debugger attachment. Snapshot refs contain generation IDs and invalidate on navigation/new read/detach/close. Queued commands respect deadline/cancel/epoch. Mutations are never replayed; unknown outcomes are surfaced.
- CDP captures console/network only from attached owned tabs, bounded to 200 entries and no request headers/body. Global content-script interception was removed.
- Browser setup/repair/profile/tab actions use the existing accessible Modal and central IPC contract.
- Repair verifies helper bytes and avoids overwriting running executables. Invalid credential JSON fails closed only for browser functions; explicit repair retains a backup and rotates the credential. Opted-in setup refreshes paths after app/portable updates.

## Review fixes

Independent read-only review identified five P2 conditions. Each was reproduced before its fix: corrupt installed helper retained by Repair; invalid browser config blocking app startup; hung extension/debugger setup or teardown blocking recovery; second tab replacing the first lease; portable extraction updates leaving an obsolete runtime path. The fix pass also made profile disable/re-enable persistent. Final gates are recorded after these fixes.

## Live browser evidence

`tests/integration/browser/native-chrome.test.ts` is opt-in with `BS_NATIVE_CHROME_E2E=1`. It ran a real Chromium profile created under an owned temporary directory, loaded the built extension, temporarily registered the compiled host, and restored the previous HKCU 32-bit Chrome native-host entry in `afterEach`.

Observed: launcher → actual bundled Electron Node runtime → helper → OS IPC → BrowserService; successful hello/ready handshake; session-created background tab; AX snapshot and click via generation ref; one mutation only; console/network event capture on the owned tab; old refs rejected after newer read; another session rejected; app service closed/restarted and extension reconnected without re-pairing. User Chrome profiles, cookies and accounts were not read or copied.

## Verification

- Framing/session-tab fixtures, native host child-process and launcher tests use owned temporary files, independent IPC endpoints and cleanup.
- Native registration generated-file tests cover Windows/macOS/Linux paths, rollback, private permissions, repair, config rotation opt-in and runtime refresh.
- Browser UI E2E covers corrupt credentials with usable app, multiple profile selection, tab assignment failure/success, correct owning session, keyboard and narrow viewport.
- Chromium integration passed before final debugger deadline repair; rerun after all fixes is recorded below.
- macOS/Linux browser/helper runtime execution is not locally verified. Edge is not registered. Chrome restricted URLs, enterprise policy and DevTools can still deny debugger access and report errors.

## Setup for users

Install the updated v1.3.8 app. Open Browser → Install / Repair helper. Open the chosen Chrome profile's extensions page, remove the old unpacked bridge once, then Load unpacked from the app's Extension folder. The new extension has a stable manifest key. Open its popup, name the profile and Connect. Select it in BS Coding and assign a tab to the current chat; agent-created tabs are assigned automatically.

This implementation does not publish an extension to Chrome Web Store or a GitHub app release. Local Setup/Portable artifacts include the helper after packaging verification. Browser protocol details live in docs/design/08-browser.md.

## Final gate results

- TypeScript node/web/extension/tests: PASS.
- Full unit/integration: 176 files passed; 1,347 tests passed. The opt-in real Chromium test is skipped by the normal gate and was run separately with explicit opt-in.
- Full Electron E2E: 28/28 PASS, including corrupt browser setup and profile/tab assignment UI.
- Build extension/helper/Windows launcher/main/preload/renderer: PASS.
- Strict UI audit: zero findings (2026-10-01-native-browser-ui-audit.json).
- Final real Chromium test after review fixes: PASS, including multiple session-owned tabs, scoped console/network, stale/cross-session refs, one click only and app restart reconnect. Temporary registry value restored; temporary browser/profile data cleaned.
- Windows Setup/Portable local packaging: PASS (`npm run dist -- --publish never`). Helper/launcher and updated extension are included beside the app ASAR.
- The same real Chromium integration passed using the packaged `release/win-unpacked/BS Coding.exe` runtime and packaged native-host assets, rather than dev Electron/helper.
- Packaged app launched against isolated userData and reported version 1.3.8, transport native, port 0. No first-run host registration was performed by that smoke test. No GitHub release/tag was created.
