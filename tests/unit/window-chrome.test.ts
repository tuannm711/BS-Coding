import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_USER_MODEL_ID, getWindowChromeOptions, resolveWindowIconPath } from '../../src/main/window-chrome'

describe('getWindowChromeOptions', () => {
  it('uses a hidden title bar with a colored overlay on Windows', () => {
    const opts = getWindowChromeOptions('win32')
    expect(opts.titleBarStyle).toBe('hidden')
    expect(opts.titleBarOverlay).toEqual({ color: '#252526', symbolColor: '#cccccc', height: 32 })
    expect(opts.frame).toBeUndefined()
  })

  it('insets native traffic lights without recoloring them on macOS', () => {
    const opts = getWindowChromeOptions('darwin')
    expect(opts.titleBarStyle).toBe('hiddenInset')
    expect(opts.trafficLightPosition).toEqual({ x: 12, y: 10 })
    expect(opts.titleBarOverlay).toBeUndefined()
  })

  it('removes the native frame entirely on Linux for custom-drawn controls', () => {
    const opts = getWindowChromeOptions('linux')
    expect(opts.frame).toBe(false)
    expect(opts.titleBarStyle).toBeUndefined()
  })

  it('falls back to the default native frame on unrecognized platforms', () => {
    const opts = getWindowChromeOptions('aix')
    expect(opts.frame).toBe(true)
  })
})

describe('taskbar identity', () => {
  it('matches the appId that electron-builder stamps on the installed shortcut', () => {
    expect(APP_USER_MODEL_ID).toBe('com.bs.coding')
  })
})

describe('resolveWindowIconPath', () => {
  it('points at the bundled PNG when running unpackaged on Windows', () => {
    expect(resolveWindowIconPath('win32', false, '/app')).toBe(path.join('/app', 'build', 'icons', '256x256.png'))
  })

  it('points at the bundled PNG when running unpackaged on Linux', () => {
    expect(resolveWindowIconPath('linux', false, '/app')).toBe(path.join('/app', 'build', 'icons', '256x256.png'))
  })

  it('defers to the executable resource once packaged, since build/icons is not shipped', () => {
    expect(resolveWindowIconPath('win32', true, '/app')).toBeUndefined()
    expect(resolveWindowIconPath('linux', true, '/app')).toBeUndefined()
  })

  it('never sets a window icon on macOS, where the bundle owns it', () => {
    expect(resolveWindowIconPath('darwin', false, '/app')).toBeUndefined()
    expect(resolveWindowIconPath('darwin', true, '/app')).toBeUndefined()
  })
})
