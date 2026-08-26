# Build and release

How source becomes three installers, what ships inside them, and what a tag sets
in motion. Everything here has been exercised end to end for v1.1.2 through
v1.1.4.

<!-- toc -->
| Section | Lines | Names |
| --- | --- | --- |
| [Pieces](#pieces) | 17-28 | `electron.vite.config.ts`, `out/`, `electron-builder.ts`, `.github/workflows/build.yml`, `scripts/build-windows-icon.mjs`, `icon.ico` |
| [Data flow](#data-flow) | 29-45 | `.ico`, `resources/tray-icon.png`, `out/`, `electron-builder`, `release/`, `.github/workflows/build.yml` |
| [Types that carry it](#types-that-carry-it) | 46-57 | `Configuration`, `electron-builder.ts`, `appId`, `com.bs.coding`, `productName`, `release/` |
| [Design decisions](#design-decisions) | 58-91 | `scripts/build-windows-icon.mjs`, `sign-windows.ps1`, `GITHUB_ACTIONS`, `resources/tray-icon.png`, `build/icons/32x32.png`, `extraResources` |
| [Known limits](#known-limits) | 92-102 |  |
<!-- /toc -->

## Pieces

| Path | Responsibility |
|---|---|
| `electron.vite.config.ts` | Three vite builds — main, preload, renderer — into `out/` |
| `electron-builder.ts` | Packaging: app id, targets, what ships, signing hook |
| `.github/workflows/build.yml` | CI: test, then build on all three runners, then publish |
| `scripts/build-windows-icon.mjs` | Assembles `icon.ico` and regenerates the tray asset |
| `scripts/build-extension.mjs` | Bundles the Chrome extension into `out/browser-extension` |
| `scripts/sign-windows.ps1` | Azure Trusted Signing, with a deliberate skip path |
| `src/main/updater.ts` | electron-updater wrapper, emits `UpdaterStatusEvent` |

## Data flow

**Local build.** `npm run build:extension` bundles the extension, `build:icon`
assembles the multi-resolution `.ico` and refreshes `resources/tray-icon.png`,
`electron-vite build` produces `out/`, and `electron-builder` packages it into
`release/`.

**Release.** Pushing a `v*` tag triggers `.github/workflows/build.yml`. The `test`
job runs typecheck and the suite on Ubuntu. Only if it passes do three `build`
jobs run in parallel — Windows, macOS, Linux — each packaging with
`--publish never` and uploading artifacts. A final `publish` job, gated on the ref
being a tag, downloads them and creates the GitHub release.

**Update.** `src/main/updater.ts` polls the published release feed and reports
progress to the renderer, which surfaces it in the Updates tab and the update
dialog.

## Types that carry it

`Configuration` from electron-builder, in `electron-builder.ts`: `appId`
`com.bs.coding`, `productName` `BS Coding`, output to `release/`.

`files` is `out/**/*` plus `package.json` — nothing else is packaged.
`extraResources` adds three things beside the asar: `resources/skills`,
`out/browser-extension`, and `resources/tray-icon.png`.

`UpdaterStatusEvent` in `src/shared/ipc.ts` carries update progress to the
renderer.

## Design decisions

**Tests gate the builds, and the builds gate the publish.** The workflow's `build`
jobs declare `needs: test`, and `publish` declares `needs: build` plus a tag
check. A failing test cannot produce an installer, and a failing build on any one
platform stops the release rather than shipping a partial set.

**Signing skips instead of failing when it is not configured.**
`scripts/build-windows-icon.mjs` aside, `sign-windows.ps1` exits 0 with a message
when `GITHUB_ACTIONS` is not `true` or when the Azure Trusted Signing variables
are missing. A local `npm run dist` therefore produces unsigned but working
artifacts, while CI produces signed ones. Failing locally would make the packaging
path untestable off CI.

**The tray asset is committed and generated.** `build:icon` writes
`resources/tray-icon.png` from `build/icons/32x32.png`, and a test fails if the
committed copy differs. Generation alone would not be enough: CI runs `build:icon`
only for the Windows target while `extraResources` ships the asset on all three,
so macOS and Linux would package whatever was committed. The test is what covers
them.

**`build/icons` is not packaged.** It is a build input, not a runtime resource,
so the app cannot read it once installed. `TrayManager.iconPath` accounts for
this by reading `process.resourcesPath` when packaged and `build/icons` when not.

**The OAuth client secret ships in the asar and cannot be removed.** Google
rejects a refresh without `client_secret` even when PKCE is used — measured, with
`400 invalid_request: client_secret is missing.` It therefore has to be in the
binary. See debt item 5 in `docs/technical-debt.md` for the full position.

**Publishing is tag-driven, never branch-driven.** Pushing `master` runs nothing.
Only `refs/tags/v*` reaches the `publish` job, so ordinary merges cannot release
by accident.

## Known limits

There is no staging or pre-release channel; a tag publishes to everyone.

The Windows signing path is the only one wired up. macOS artifacts are unsigned
and unnotarised, so Gatekeeper will warn.

Node 20 is pinned in the workflow while the runners now force Node 24 for the
actions themselves, which currently produces a deprecation annotation on every
run.
