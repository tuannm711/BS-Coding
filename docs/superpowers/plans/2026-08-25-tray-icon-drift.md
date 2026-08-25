# Stale Tray Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task. Subagents are not permitted on this project,
> so the subagent-driven variant does not apply. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Make the packaged app show the BS Coding logo in the Windows
notification area, and make it impossible for that asset to drift from the icon
sources again.

**Architecture:** Replace `resources/tray-icon.png` with the current
`build/icons/32x32.png`, teach `scripts/build-windows-icon.mjs` to regenerate it,
and add a test that fails whenever the two files differ. The test is what
protects the macOS and Linux packages, where `npm run build:icon` never runs.

**Tech Stack:** Node ESM build script, vitest, electron-builder `extraResources`.

## Global Constraints

- `resources/tray-icon.png` stays committed to git. It is not gitignored and not
  generated-only, because CI runs `npm run build:icon` only when
  `matrix.target == 'win'` while `extraResources` ships the file on all three
  platforms.
- The tray asset must be a byte-for-byte copy of `build/icons/32x32.png`. Not a
  re-encode, not a resize.
- Do not modify `src/main/tray-manager.ts`. Its path resolution is correct; only
  the asset it points at was stale.
- Do not touch the `AppUserModelID` code shipped in v1.1.2.
- Test baseline before any change: 141 test files, 962 tests passing. This plan
  adds 2 tests, so the target is 964.
- Do not tag or bump the version. This branch merges without a release; the
  release ships together with the `near-limit` cleanup.

---

### Task 1: Replace the stale asset behind a guard test

**Files:**
- Modify: `tests/unit/windows-icon-build.test.ts`
- Modify: `resources/tray-icon.png`

**Interfaces:**
- Consumes: nothing.
- Produces: a committed tray asset matching `build/icons/32x32.png`, and a test
  that fails if they ever diverge. Task 2 keeps that test passing automatically.

- [ ] **Step 1: Write the failing test**

Add this case to the existing `describe('Windows icon build', ...)` block in
`tests/unit/windows-icon-build.test.ts`:

```ts
  it('ships the current 32x32 artwork as the packaged tray icon', () => {
    expect(readFileSync(path.resolve('resources/tray-icon.png'))).toEqual(
      readFileSync(path.resolve('build/icons/32x32.png'))
    )
  })
```

`readFileSync` and `path` are already imported in this file. No new imports.

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: FAIL on the new case. The two buffers differ — the committed asset is
1925 bytes of the old cat logo, the source is 2353 bytes of the BS wordmark. The
other two cases in the file must still pass.

- [ ] **Step 3: Replace the asset**

```bash
cp build/icons/32x32.png resources/tray-icon.png
```

- [ ] **Step 4: Confirm the copy is exact**

```bash
md5sum resources/tray-icon.png build/icons/32x32.png
```

Expected: both report `f80e1928e49fdc7f557b3dc191266667`.

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

Stage the test and the asset. Subject:

```
fix: ship the current logo as the packaged tray icon
```

Body: `resources/tray-icon.png` was byte-identical to the pre-rebrand
`build/icons/32x32.png`, so packaged builds showed the old Meow Coding cat in the
notification area while every other surface showed the BS Coding mark. Commit
`12499c3` refreshed `build/icons` and missed this file because it lives outside
that directory. Add a test that fails on any future drift. End with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 2: Regenerate the tray asset during the icon build

**Files:**
- Modify: `scripts/build-windows-icon.mjs`
- Modify: `tests/unit/windows-icon-build.test.ts`

**Interfaces:**
- Consumes: the asset and guard test from Task 1.
- Produces: `syncTrayIcon(sourceDir: string, outputFile: string): void`, exported
  from `scripts/build-windows-icon.mjs` and invoked by its CLI entry point.

- [ ] **Step 1: Write the failing test**

Add to the same describe block:

```ts
  it('syncTrayIcon writes the 32x32 source to the tray destination', () => {
    const dest = path.join(mkdtempSync(path.join(tmpdir(), 'bs-tray-')), 'tray-icon.png')
    syncTrayIcon(path.resolve('build/icons'), dest)
    expect(readFileSync(dest)).toEqual(readFileSync(path.resolve('build/icons/32x32.png')))
  })
```

Then extend the existing import so it reads:

```ts
import { buildWindowsIcon, readIcoEntries, syncTrayIcon } from '../../scripts/build-windows-icon.mjs'
```

`mkdtempSync` and `tmpdir` are already imported in this file.

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: FAIL with `syncTrayIcon is not a function`.

- [ ] **Step 3: Implement `syncTrayIcon`**

Add to `scripts/build-windows-icon.mjs`, after `buildWindowsIcon`:

```js
export function syncTrayIcon(sourceDir, outputFile) {
  const data = readFileSync(path.join(sourceDir, '32x32.png'))
  const dimensions = readPngDimensions(data)
  if (dimensions.width !== 32 || dimensions.height !== 32) {
    throw new Error(`32x32.png has ${dimensions.width}x${dimensions.height} pixels`)
  }
  mkdirSync(path.dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, data)
}
```

`readFileSync`, `mkdirSync`, `writeFileSync`, `path` and `readPngDimensions` all
already exist in this module.

- [ ] **Step 4: Invoke it from the CLI entry point**

Replace the existing entry block at the bottom of the file:

```js
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === fileURLToPath(import.meta.url)) {
  buildWindowsIcon(path.resolve('build/icons'), path.resolve('build/icons/icon.ico'))
  syncTrayIcon(path.resolve('build/icons'), path.resolve('resources/tray-icon.png'))
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Confirm the script is idempotent**

```bash
npm run build:icon && git status --porcelain
```

Expected: no output from `git status`. The script regenerates the same bytes it
already committed, so running it changes nothing.

- [ ] **Step 7: Full suite and typecheck**

```bash
npm test && npm run typecheck
```

Expected: `Tests 964 passed (964)` and no typecheck diagnostics.

- [ ] **Step 8: Commit**

Stage the script and the test. Subject:

```
build: regenerate the tray icon from the icon sources
```

Body: `npm run build:icon` now copies `build/icons/32x32.png` to
`resources/tray-icon.png`, so the packaged tray asset cannot fall behind the
sources on Windows. The committed file and its guard test remain, because CI runs
`build:icon` only for the Windows target while `extraResources` ships the asset on
macOS and Linux too. End with the
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` trailer.

---

### Task 3: Confirm the packaged resources carry the new asset

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: everything above.
- Produces: proof that the packaged tree ships the correct tray asset.

- [ ] **Step 1: Package**

```bash
npm run build:extension && npm run build:icon && npx electron-vite build && npx electron-builder --win --publish never
```

Expected: exit code 0.

- [ ] **Step 2: Compare the packaged asset against the source**

```bash
md5sum "release/win-unpacked/resources/tray-icon.png" build/icons/32x32.png
```

Expected: both report `f80e1928e49fdc7f557b3dc191266667`. This is the file
`TrayManager.iconPath()` reads at `process.resourcesPath/tray-icon.png` when
packaged.

---

### Task 4: Confirm the notification area renders the new mark

**Files:** none modified. This task is a verification gate.

**Interfaces:**
- Consumes: the packaged build from Task 3.
- Produces: a screenshot showing the tray icon, which is the symptom being fixed.

- [ ] **Step 1: Run the packaged build**

Launch `release/win-unpacked/BS Coding.exe` and wait for the window to appear.

- [ ] **Step 2: Capture and inspect the notification area**

Capture the bottom strip of the primary screen, crop the region just right of
the tray overflow chevron, and magnify it with nearest-neighbour scaling. The
pass condition is the BS wordmark. The cat means Windows is still serving a
cached icon — clear it with `ie4uinit.exe -show` and capture again.

- [ ] **Step 3: Judge legibility at tray size**

The spec flags that the BS wordmark is denser than the cat and may read less
clearly at 32 pixels. Report the magnified capture rather than deciding alone.

- [ ] **Step 4: Stop the app and report**

Do not merge, tag, bump the version, or push. Report all four tasks and wait for
the final approval gate. Merge is handled after that gate with the
`superpowers:finishing-a-development-branch` skill, and this branch merges
without a release tag.
