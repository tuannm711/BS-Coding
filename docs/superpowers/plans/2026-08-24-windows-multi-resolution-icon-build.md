# Windows Multi-resolution Icon Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild BS Coding 1.0.0 so all Windows packaging surfaces use a deterministic multi-resolution ICO assembled from the approved PNG files in `build/icons`.

**Architecture:** A dependency-free Node script validates the eight authoritative PNG dimensions and writes an ICO container using the original 16–256 pixel PNG payloads. Electron Builder invokes the generator before Windows packaging, uses the ICO for executable and NSIS surfaces, and keeps the 512 pixel PNG as the general high-resolution icon.

**Tech Stack:** Node.js ESM, Electron Builder 26, TypeScript/Vitest, PowerShell release verification.

---

## File map

- Create `scripts/build-windows-icon.mjs`: validate PNG dimensions, assemble and inspect a PNG-backed ICO.
- Create `tests/unit/windows-icon-build.test.ts`: protect frame sizes, source-byte reuse, and invalid-dimension rejection.
- Modify `package.json`: expose `build:icon` and run it in `predist`.
- Modify `electron-builder.ts`: route general, Windows, and NSIS icon settings to `build/icons`.
- Modify `.gitignore`: ignore the generated `build/icons/icon.ico` artifact.

### Task 1: Add the deterministic ICO generator

**Files:**
- Create: `scripts/build-windows-icon.mjs`
- Test: `tests/unit/windows-icon-build.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create tests that call the generator against the real approved source directory and a temporary output file:

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildWindowsIcon, readIcoEntries } from '../../scripts/build-windows-icon.mjs'

describe('Windows icon build', () => {
  it('embeds each approved 16–256 PNG as its own ICO frame', () => {
    const output = path.join(mkdtempSync(path.join(tmpdir(), 'bs-icon-')), 'icon.ico')
    buildWindowsIcon(path.resolve('build/icons'), output)
    expect(readIcoEntries(readFileSync(output)).map(entry => entry.size)).toEqual([16, 24, 32, 48, 64, 128, 256])
  })

  it('rejects a PNG whose pixels do not match its declared size', () => {
    const source = mkdtempSync(path.join(tmpdir(), 'bs-icon-invalid-'))
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      copyFileSync(path.resolve(`build/icons/${size}x${size}.png`), path.join(source, `${size}x${size}.png`))
    }
    copyFileSync(path.resolve('build/icons/16x16.png'), path.join(source, '24x24.png'))
    expect(() => buildWindowsIcon(source, path.join(source, 'icon.ico'))).toThrow(/24x24/)
  })
})
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run:

```powershell
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: FAIL because `scripts/build-windows-icon.mjs` does not exist.

- [ ] **Step 3: Implement the dependency-free ICO writer**

Implement these exports in `scripts/build-windows-icon.mjs`:

```js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
export const ICO_SIZES = SOURCE_SIZES.filter(size => size <= 256)

export function readPngDimensions(buffer) {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(png)) throw new Error('Invalid PNG source')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export function readIcoEntries(buffer) {
  const count = buffer.readUInt16LE(4)
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16
    return {
      size: buffer[offset] || 256,
      bytes: buffer.readUInt32LE(offset + 8),
      imageOffset: buffer.readUInt32LE(offset + 12)
    }
  })
}

export function buildWindowsIcon(sourceDir, outputFile) {
  const sources = new Map(SOURCE_SIZES.map(size => {
    const file = path.join(sourceDir, `${size}x${size}.png`)
    const data = readFileSync(file)
    const dimensions = readPngDimensions(data)
    if (dimensions.width !== size || dimensions.height !== size) {
      throw new Error(`${size}x${size}.png has ${dimensions.width}x${dimensions.height} pixels`)
    }
    return [size, data]
  }))
  const headerSize = 6 + ICO_SIZES.length * 16
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(ICO_SIZES.length, 4)
  let imageOffset = headerSize
  ICO_SIZES.forEach((size, index) => {
    const data = sources.get(size)
    const offset = 6 + index * 16
    header[offset] = size === 256 ? 0 : size
    header[offset + 1] = size === 256 ? 0 : size
    header.writeUInt16LE(1, offset + 4)
    header.writeUInt16LE(32, offset + 6)
    header.writeUInt32LE(data.length, offset + 8)
    header.writeUInt32LE(imageOffset, offset + 12)
    imageOffset += data.length
  })
  mkdirSync(path.dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, Buffer.concat([header, ...ICO_SIZES.map(size => sources.get(size))]))
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === fileURLToPath(import.meta.url)) {
  buildWindowsIcon(path.resolve('build/icons'), path.resolve('build/icons/icon.ico'))
}
```

- [ ] **Step 4: Run the focused tests and verify PASS**

Run:

```powershell
npx vitest run tests/unit/windows-icon-build.test.ts
```

Expected: one test file and two tests pass.

- [ ] **Step 5: Commit the generator and tests**

```powershell
git add -- scripts/build-windows-icon.mjs tests/unit/windows-icon-build.test.ts
git commit -m "build: generate Windows icon from approved sizes"
```

### Task 2: Route Electron packaging to the generated icon

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add the generation script and packaging pre-hook**

Update `package.json` scripts:

```json
"build:icon": "node scripts/build-windows-icon.mjs",
"predist": "npm run build:extension && npm run build:icon"
```

- [ ] **Step 2: Configure app, Windows, and NSIS icons**

Update `electron-builder.ts`:

```ts
icon: 'build/icons/512x512.png',
win: {
  icon: 'build/icons/icon.ico',
  target: [
    { target: 'nsis', arch: ['x64'] },
    { target: 'portable', arch: ['x64'] }
  ],
  signtoolOptions: {
    sign: signWindows,
    signingHashAlgorithms: ['sha256']
  }
},
nsis: {
  artifactName: 'BS.Coding.Setup.${version}.${ext}',
  installerIcon: 'build/icons/icon.ico',
  uninstallerIcon: 'build/icons/icon.ico',
  installerHeaderIcon: 'build/icons/icon.ico',
  oneClick: false,
  allowToChangeInstallationDirectory: true,
  createDesktopShortcut: true,
  createStartMenuShortcut: true
}
```

- [ ] **Step 3: Ignore only the generated ICO**

Append to `.gitignore`:

```gitignore
build/icons/icon.ico
```

- [ ] **Step 4: Generate and inspect the ICO**

Run:

```powershell
npm run build:icon
node -e "import('./scripts/build-windows-icon.mjs').then(({readIcoEntries}) => { const fs=require('node:fs'); console.log(readIcoEntries(fs.readFileSync('build/icons/icon.ico')).map(x => x.size).join(',')) })"
```

Expected: `16,24,32,48,64,128,256`.

- [ ] **Step 5: Run focused and configuration verification**

Run:

```powershell
npx vitest run tests/unit/windows-icon-build.test.ts
npm run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit packaging configuration**

```powershell
git add -- package.json electron-builder.ts .gitignore
git commit -m "build: use multi-resolution BS Coding icon on Windows"
```

### Task 3: Merge, rebuild, and verify release artifacts

**Files:**
- Source assets preserved: `C:\Users\brads\Documents\BS Coding\build\icons\*.png`
- Generated, ignored: `C:\Users\brads\Documents\BS Coding\build\icons\icon.ico`
- Outputs: `C:\Users\brads\Documents\BS Coding\release\BS.Coding.Setup.1.0.0.exe`
- Outputs: `C:\Users\brads\Documents\BS Coding\release\BS.Coding.1.0.0.exe`

- [ ] **Step 1: Record all source PNG hashes before merge/build**

```powershell
Get-ChildItem build/icons -Filter *.png | Sort-Object Name | Get-FileHash -Algorithm SHA256
```

Expected: eight hashes are recorded for comparison.

- [ ] **Step 2: Merge the implementation commits into `master`**

Run from `C:\Users\brads\Documents\BS Coding`:

```powershell
git merge --no-ff codex/bs-coding-rebrand -m "merge: use approved Windows icon set"
```

Expected: merge succeeds without staging or changing the eight existing PNG files.

- [ ] **Step 3: Run the complete required verification**

```powershell
npm run typecheck
npm test
npm run dist
```

Expected: typecheck exits 0, all Vitest tests pass, and Electron Builder emits installer plus portable artifacts.

- [ ] **Step 4: Verify the generated ICO and unchanged PNG sources**

```powershell
node -e "import('./scripts/build-windows-icon.mjs').then(({readIcoEntries}) => { const fs=require('node:fs'); console.log(readIcoEntries(fs.readFileSync('build/icons/icon.ico')).map(x => x.size).join(',')) })"
Get-ChildItem build/icons -Filter *.png | Sort-Object Name | Get-FileHash -Algorithm SHA256
```

Expected: ICO sizes are `16,24,32,48,64,128,256`; all eight PNG hashes match Step 1.

- [ ] **Step 5: Verify release metadata and hashes**

```powershell
Get-FileHash -Algorithm SHA256 release/BS.Coding.Setup.1.0.0.exe,release/BS.Coding.1.0.0.exe
(Get-Item 'release/win-unpacked/BS Coding.exe').VersionInfo | Select-Object ProductName,ProductVersion,FileVersion
```

Expected: both hashes are present; metadata reports BS Coding and version 1.0.0.

- [ ] **Step 6: Confirm repository hygiene**

```powershell
git status --short
git diff --check
```

Expected: only the eight pre-existing modified PNG files remain visible; generated ICO and release outputs remain ignored.
