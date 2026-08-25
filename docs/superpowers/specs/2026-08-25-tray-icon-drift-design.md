# Stale tray icon — design

Date: 2026-08-25
Branch: `fix/taskbar-icon-identity`
Release: deferred — merges without a tag, ships alongside the `near-limit` cleanup

## Problem

The packaged app shows the previous "moew CODING" cat logo in the Windows
notification area. Everything else — the executable, the installer, the window,
the Start Menu and desktop shortcuts — shows the current BS Coding logo.

The icon in the captured screenshot sits immediately to the right of the tray
overflow chevron, which places it in the notification area rather than on the
taskbar button. That narrows the source to one file.

`resources/tray-icon.png` is byte-identical to the pre-rebrand
`build/icons/32x32.png`:

| File | md5 | Size |
|---|---|---|
| `resources/tray-icon.png` | `81515dab468edb1a57b8d5698b24e154` | 1925 B |
| `build/icons/32x32.png` before commit `12499c3` | `81515dab468edb1a57b8d5698b24e154` | 1925 B |
| `build/icons/32x32.png` today | `f80e1928e49fdc7f557b3dc191266667` | 2353 B |

Commit `12499c3` ("chore: publish BS Coding release icons") refreshed all eight
PNGs under `build/icons/` and `bs-coding-logo.png`. It did not touch
`resources/tray-icon.png`, which has not changed since the tray feature landed
in `fab6ba1` on 2026-08-21 — before the app was renamed from `com.meow.coding`
to `com.bs.coding` in `706cca4` on 2026-08-22.

Why only the packaged build is affected: `TrayManager.iconPath()` in
`src/main/tray-manager.ts:45` reads `process.resourcesPath/tray-icon.png` when
packaged and `build/icons/32x32.png` when not. Development runs read the current
source and look correct; only shipped builds carry the stale copy.

This is not the `AppUserModelID` issue fixed in v1.1.2. That fix addressed
taskbar button identity and shortcut pinning, which remains correct and
unrelated.

## Approach

Two changes, one dependent on the other.

**Replace the asset.** `resources/tray-icon.png` becomes a copy of the current
`build/icons/32x32.png`. Same dimensions, same role, current artwork.

**Generate it during the icon build.** `scripts/build-windows-icon.mjs` gains a
`syncTrayIcon(sourceDir, outputFile)` export that copies `32x32.png` to the tray
asset, called from the script's CLI entry point alongside `buildWindowsIcon`.
After this, `npm run build:icon` cannot leave the two out of step.

**A guard test, because generation alone is not sufficient.** CI runs
`npm run build:icon` only when `matrix.target == 'win'`, while
`extraResources` copies `resources/tray-icon.png` into the macOS and Linux
packages too. On those runners the committed file ships as-is, so generation
would not protect them. The file therefore stays committed, and a test asserts
it matches `build/icons/32x32.png` byte for byte. That test runs in the `test`
job on every push and every tag, on Ubuntu, before any build job starts.

Without the test, this fix would hold on Windows and silently rot on the other
two platforms — the same class of failure being fixed here.

## Files

| File | Change |
|---|---|
| `resources/tray-icon.png` | Replaced with current 32x32 artwork |
| `scripts/build-windows-icon.mjs` | Add and invoke `syncTrayIcon` |
| `tests/unit/windows-icon-build.test.ts` | Add drift guard and `syncTrayIcon` coverage |

## Verification

1. A test asserting `resources/tray-icon.png` equals `build/icons/32x32.png`
   fails before the asset is replaced and passes after.
2. A test asserting `syncTrayIcon` writes the 32x32 source to its destination.
3. `npm test` passes with the new count: 962 plus the tests added here.
4. `npm run typecheck` passes.
5. `npx electron-builder --win --publish never` packages, and
   `release/win-unpacked/resources/tray-icon.png` matches
   `build/icons/32x32.png`.
6. The packaged app runs and the notification area shows the BS Coding logo.

Step 6 is a manual check against a screenshot of the tray, since that is the
symptom being fixed and the only step that confirms it end to end.

## Risks

**The tray icon renders differently at 32x32 than the old one did.** The old
artwork was a cat on a dark rounded square; the new one is the BS wordmark. Both
are 32x32 with transparency, so the mechanism is unchanged, but the new mark is
denser and may read less clearly at tray size. Step 6 is where that gets judged.

**Windows may keep serving a cached tray icon after the upgrade.** The
notification area caches per executable. If the old icon persists after
installing the fixed build, `ie4uinit.exe -show` clears it. This is a local
display cache, not a defect in the build.

## Out of scope

**The `AppUserModelID` behaviour shipped in v1.1.2.** Correct and unrelated.

**macOS and Linux tray artwork.** `extraResources` ships the same PNG to all
three platforms and this change keeps that arrangement. Platform-specific tray
assets — a macOS template image, for instance — are a separate question.

**The dead `near-limit` field.** Tracked separately; this branch merges without
a tag so both ship in one release.

## Success criteria

The notification area shows the BS Coding logo in a packaged build; `npm test`
fails if `resources/tray-icon.png` ever drifts from `build/icons/32x32.png`
again; the branch merges to `master` without a release tag.
