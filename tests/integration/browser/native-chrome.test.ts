import { afterEach, describe, expect, it } from 'vitest'
import { chromium, type BrowserContext } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { BrowserService } from '../../../src/main/browser/service'
import { getNativeConnectionConfig, prepareNativeHost } from '../../../src/main/browser/native-install'
import { NATIVE_EXTENSION_ID, NATIVE_HOST_NAME } from '../../../src/shared/browser-native'

// Opt-in: isolated browser profiles, real native host registration, restored in finally.
// Never uses the user's Chrome profile, accounts or cookies.
describe.skipIf(process.env.BS_NATIVE_CHROME_E2E !== '1' || process.platform !== 'win32')('native connection in real Chromium', () => {
  let root: string | undefined
  let browser: BrowserContext | undefined
  let service: BrowserService | undefined
  let server: http.Server | undefined
  const key = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`
  let previous: string | undefined
  let registryChanged = false
  afterEach(async () => {
    await browser?.close(); browser = undefined
    await service?.close(); service = undefined
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); server = undefined }
    if (registryChanged) {
      if (previous) execFileSync('reg.exe', ['add', key, '/ve', '/t', 'REG_SZ', '/d', previous, '/f', '/reg:32'], { windowsHide: true })
      else execFileSync('reg.exe', ['delete', key, '/f', '/reg:32'], { windowsHide: true })
      registryChanged = false
    }
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  })

  it('uses the compiled launcher/helper for owned tab read/action, snapshot invalidation and app reconnect', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'bs-native-chrome-'))
    const userData = path.join(root, 'app'); mkdirSync(userData)
    try { previous = execFileSync('reg.exe', ['query', key, '/ve', '/reg:32'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).match(/REG_SZ\s+([^\r\n]+)/)?.[1]?.trim() } catch { previous = undefined }
    const config = getNativeConnectionConfig(userData)
    service = new BrowserService({ ...config, screenshotDir: root, snapshotDir: root })
    await service.start()
    registryChanged = true
    const installed = await prepareNativeHost({ userDataDir: userData, sourceDir: path.resolve(process.env.BS_NATIVE_HOST_SOURCE ?? 'out/browser-native-host'), runtimePath: path.resolve(process.env.BS_NATIVE_RUNTIME_PATH ?? 'node_modules/electron/dist/electron.exe') })
    expect(installed.installed, installed.error).toBe(true)
    let clicks = 0
    server = http.createServer((req, res) => {
      if (req.url === '/clicked') { clicks++; res.end('ok'); return }
      res.setHeader('Content-Type', 'text/html')
      res.end('<!doctype html><title>Native test page</title><h1>Owned tab fixture</h1><button id="go" onclick="fetch(\'/clicked\'); this.textContent=\'Clicked\';console.log(\'owned log\')">Click fixture</button>')
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
    const ext = path.resolve('out/browser-extension')
    browser = await chromium.launchPersistentContext(path.join(root, 'chrome'), { headless: false, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] })
    const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker')
    expect(worker.url()).toContain(NATIVE_EXTENSION_ID)
    await expect.poll(() => service!.getStatus().paired, { timeout: 20000 }).toBe(true)
    const first = await service.execute('openTab', { url }, 10000, { ownerId: 'session-a' })
    expect(first.ok).toBe(true)
    await expect.poll(() => browser!.pages().some(page => page.url().startsWith(url))).toBe(true)
    const page = browser.pages().find(page => page.url().startsWith(url))!
    await page.waitForLoadState('domcontentloaded')
    const read = await service.execute('read', { mode: 'interactive' }, 10000, { ownerId: 'session-a' })
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const data = read.data as { preview: string; path: string; snapshotId: string }
    expect(data.preview).toContain('Click fixture')
    const snapshot = readFileSync(data.path, 'utf8')
    const ref = snapshot.split('\n').find(line => line.includes('Click fixture'))?.match(/\[([^\]\s]+)\]/)?.[1]
    expect(ref).toBeTruthy()
    const click = await service.execute('click', { ref }, 10000, { ownerId: 'session-a' })
    expect(click.ok).toBe(true)
    await expect.poll(() => clicks).toBe(1)
    await expect.poll(() => service!.getConsoleLogs(200, 'session-a').some(entry => JSON.stringify(entry).includes('owned log'))).toBe(true)
    await expect.poll(() => service!.getNetworkLogs(200, 'session-a').some(entry => JSON.stringify(entry).includes('/clicked'))).toBe(true)
    const secondRead = await service.execute('read', {}, 10000, { ownerId: 'session-a' }); expect(secondRead.ok).toBe(true)
    const stale = await service.execute('click', { ref }, 10000, { ownerId: 'session-a' }); expect(stale).toMatchObject({ ok: false, error: expect.stringMatching(/STALE|stale/i) })
    const foreign = await service.execute('click', { ref }, 10000, { ownerId: 'session-b' })
    expect(foreign).toMatchObject({ ok: false, error: expect.stringMatching(/assigned|owned|tab/i) })
    const firstTab = (first.ok ? first.data as { tabId: number } : undefined)!.tabId
    const anotherTab = await service.execute('openTab', { url }, 10000, { ownerId: 'session-a' })
    expect(anotherTab.ok).toBe(true)
    const switched = await service.execute('switchTab', { tabId: firstTab }, 10000, { ownerId: 'session-a' })
    expect(switched.ok).toBe(true)
    const oldLeasedRead = await service.execute('read', { tabId: firstTab }, 10000, { ownerId: 'session-a' })
    expect(oldLeasedRead.ok).toBe(true)
    await service.close()
    service = new BrowserService({ ...config, screenshotDir: root, snapshotDir: root }); await service.start()
    await expect.poll(() => service!.getStatus().paired, { timeout: 20000 }).toBe(true)
    const reconnect = await service.execute('listTabs', {}, 10000, { ownerId: 'session-a' }); expect(reconnect.ok).toBe(true)
    expect(clicks).toBe(1)
  }, 60000)
})
