import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'

it('generates one mac updater manifest for native x64 and arm64 ZIPs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-mac-metadata-'))
  const x64Name = 'BS Coding-2.0.0-mac.zip'
  const arm64Name = 'BS Coding-2.0.0-arm64-mac.zip'
  const x64 = Buffer.from('native-x64-package')
  const arm64 = Buffer.from('native-arm64-package')
  try {
    writeFileSync(path.join(dir, x64Name), x64)
    writeFileSync(path.join(dir, arm64Name), arm64)
    const output = path.join(dir, 'latest-mac.yml')

    execFileSync(process.execPath, [
      path.join(process.cwd(), 'scripts', 'generate-mac-update-metadata.mjs'), dir, output
    ])

    const metadata = readFileSync(output, 'utf8')
    expect(metadata).toContain('version: 2.0.0')
    expect(metadata).toContain('url: BS.Coding-2.0.0-mac.zip')
    expect(metadata).toContain('url: BS.Coding-2.0.0-arm64-mac.zip')
    expect(metadata).toContain(`sha512: ${createHash('sha512').update(x64).digest('base64')}`)
    expect(metadata).toContain(`sha512: ${createHash('sha512').update(arm64).digest('base64')}`)
    expect(metadata).toContain(`size: ${x64.length}`)
    expect(metadata).toContain(`size: ${arm64.length}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
