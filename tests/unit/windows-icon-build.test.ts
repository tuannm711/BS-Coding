import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildWindowsIcon, readIcoEntries } from '../../scripts/build-windows-icon.mjs'

const sizes = [16, 24, 32, 48, 64, 128, 256]

describe('Windows icon build', () => {
  it('embeds each approved 16–256 PNG as its own ICO frame', () => {
    const output = path.join(mkdtempSync(path.join(tmpdir(), 'bs-icon-')), 'icon.ico')
    buildWindowsIcon(path.resolve('build/icons'), output)

    const ico = readFileSync(output)
    const entries = readIcoEntries(ico)
    expect(entries.map(entry => entry.size)).toEqual(sizes)
    for (const entry of entries) {
      expect(ico.subarray(entry.imageOffset, entry.imageOffset + entry.bytes)).toEqual(
        readFileSync(path.resolve(`build/icons/${entry.size}x${entry.size}.png`))
      )
    }
  })

  it('ships the current 32x32 artwork as the packaged tray icon', () => {
    expect(readFileSync(path.resolve('resources/tray-icon.png'))).toEqual(
      readFileSync(path.resolve('build/icons/32x32.png'))
    )
  })

  it('rejects a PNG whose pixels do not match its declared size', () => {
    const source = mkdtempSync(path.join(tmpdir(), 'bs-icon-invalid-'))
    for (const size of [...sizes, 512]) {
      copyFileSync(path.resolve(`build/icons/${size}x${size}.png`), path.join(source, `${size}x${size}.png`))
    }
    copyFileSync(path.resolve('build/icons/16x16.png'), path.join(source, '24x24.png'))

    expect(() => buildWindowsIcon(source, path.join(source, 'icon.ico'))).toThrow(/24x24/)
  })
})
