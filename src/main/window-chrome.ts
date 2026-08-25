import path from 'node:path'
import type { BrowserWindowConstructorOptions } from 'electron'

const TITLE_BAR_HEIGHT = 32
const TITLE_BAR_BG = '#252526'
const TITLE_BAR_SYMBOL = '#cccccc'

export function getWindowChromeOptions(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: TITLE_BAR_BG, symbolColor: TITLE_BAR_SYMBOL, height: TITLE_BAR_HEIGHT }
    }
  }
  if (platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 10 }
    }
  }
  if (platform === 'linux') {
    return { frame: false }
  }
  return { frame: true }
}

// Windows matches a running window's taskbar button to the installed shortcut
// by AppUserModelID. electron-builder stamps the NSIS shortcut with the appId,
// so the app must claim the same id or the taskbar button falls back to a
// process-derived identity and keeps serving a stale cached icon.
export const APP_USER_MODEL_ID = 'com.bs.coding'

// build/icons ships with the repo but not with the package (electron-builder
// only bundles out/** and package.json), so a packaged run must fall back to
// the icon embedded in the executable. macOS always takes its icon from the
// app bundle.
export function resolveWindowIconPath(platform: NodeJS.Platform, isPackaged: boolean, appPath: string): string | undefined {
  if (isPackaged || platform === 'darwin') return undefined
  if (platform !== 'win32' && platform !== 'linux') return undefined
  return path.join(appPath, 'build', 'icons', '256x256.png')
}
