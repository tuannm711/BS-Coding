# Browser connection

## Pieces

| File | Responsibility |
| --- | --- |
| `src/main/browser/service.ts` | Authenticated OS IPC, profile/session routing, pending commands, setup state and artifacts |
| `src/main/browser/native-install.ts` | Private per-install credentials and explicit per-user Chrome host registration/repair |
| `src/browser-native-host/host.ts` | Framed stdio proxy from Chrome to authenticated app IPC |
| `src/browser-native-host/Launcher.cs` | Windows launcher for the bundled Electron Node runtime, framing relay and child lifecycle |
| `scripts/build-native-host.mjs` | Build helper and platform launcher |
| `src/shared/browser-native.ts` | Versioned serializable Native Messaging contract, host name and stable extension identity |
| `src/browser-extension/native-transport.ts` | Handshake, heartbeat, deadline, cancellation and whole-command queue |
| `src/browser-extension/background.ts` | Chrome command router/CDP, session tabs and scoped events |
| `src/browser-extension/session-tabs.ts` | Leased tabs plus selected default per owner; no active-tab fallback |
| `src/browser-extension/session-snapshots.ts` | Unique generation refs and invalidation |
| `src/browser-extension/cdp-events.ts` | Scoped bounded console/network events without headers or bodies |
| `src/renderer/src/components/BrowserDialog.tsx` | Setup, profile enable/disable and current-chat tab assignment |

## Data flow

Chrome `runtime.connectNative` starts the installed launcher. The helper validates
the exact extension origin and authenticates an OS-user endpoint with a random
per-install credential. Main then validates protocol version/capabilities and
assigns a fresh connection epoch. No production TCP listener or pairing code is
used. The old `src/main/browser/bridge.ts` is retained for historical tests and
is not started by MainApp.

Native tools derive owner IDs from the active session (`snapshotScopeId`), task
or agent context. New tabs belong to that owner; existing tabs require explicit
user assignment. Several tabs can remain leased to one owner, with one default.
Closing the default does not select the user's active tab. Selecting another
profile for future work does not redirect established chat bindings. Selected
profile and bindings persist across app restart; offline profiles remain offline.

The extension persists leases in browser session storage, so worker restart can
reconnect without changing tab ownership. Browser restart creates a new epoch
and session storage: no ambiguous URL/title matching occurs. Snapshot refs carry
a random snapshot ID and invalidate on navigation, close, detach or newer read.
Single debugger attachment means whole commands serialize; switching attachment
invalidates prior refs and requires a fresh read.

## Lifecycle and trust

Setup writes a Chrome NativeMessagingHosts manifest per OS user. Windows uses
HKCU 32-bit registry view; macOS/Linux use user-level Chrome manifest directories.
The public extension manifest key fixes the unpacked extension ID. Migrating the
old extension therefore needs one remove/load cycle. There is no Chrome Web Store
publication in this implementation.

Private credentials are restricted by ACL/mode. Invalid auth configuration fails
closed for browser functions while the app still opens; explicit Repair backs up
invalid JSON credentials and regenerates them. Repair verifies helper bytes and
uses a new content-addressed directory if existing files are damaged. Previously
installed helpers refresh their Electron runtime path on startup, including
portable extraction updates. First startup does not register a native host.

Commands/results bind client, epoch, session owner, request ID and deadline.
Disconnect, Stop and timeout finish pending app requests and cancel queued work;
mutations are never replayed. A result may be unknown when Chrome already began
an action. Users must inspect the page before repeating it. A hung extension
command quarantines the epoch and closes the native connection before recovery.
Disable profile is persisted and blocks reconnect until enabled.

Frames use 32-bit little-endian UTF-8 JSON. Incoming extension frames are bounded
at 8 MiB and app command frames at 512 KiB (below Chrome's 1 MiB host-output limit).
Screenshots/snapshots are stored as local artifacts. Console/network capture uses
CDP only on owned attached tabs, 200 recent entries per owner, without request
headers or response bodies. Content scripts no longer intercept fetch/XHR or
console globally.

## Verification and limits

Unit/integration fixtures cover framing, authentication, bad origins, version
negotiation, multiple profiles, queued cancellation/deadlines, stale refs,
session ownership, launcher process cleanup, setup rollback/repair and persisted
profile bindings. The opt-in `tests/integration/browser/native-chrome.test.ts`
uses a real Chromium test profile with the compiled Windows launcher/helper,
temporary registry registration and restoration.

Live Chromium verification does not read user accounts, cookies or existing
profiles. Windows is the locally tested browser runtime. macOS/Linux wrappers
and registration paths are covered by generated-file tests; their live browser
runtimes still need platform verification. Edge registration is not included.
Chrome DevTools, enterprise policy and restricted URLs can prevent debugger
access; tools report errors. Cross-origin frames that cannot be read fail the
snapshot instead of being reported as complete. Playwright-managed separate
profiles remain an optional future mode, not this primary-profile transport.
