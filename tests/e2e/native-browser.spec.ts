import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { getNativeConnectionConfig } from '../../src/main/browser/native-install'
import { NativeFrameDecoder, encodeNativeFrame } from '../../src/main/browser/native-framing'
import { NATIVE_EXTENSION_ID } from '../../src/shared/browser-native'
import { Channels } from '../../src/shared/ipc'

test('a corrupt browser credential leaves the app usable and exposes an explicit repair action', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-native-corrupt-'))
  mkdirSync(path.join(root, 'browser-native-host'))
  writeFileSync(path.join(root, 'browser-native-host/connection.json'), '{invalid-json')
  writeFileSync(path.join(root, 'bs.json'), JSON.stringify({ agents: {} }))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: root } })
    const page = await app.firstWindow()
    await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible()
    await page.getByRole('button', { name: /^browser:/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Browser connection', exact: true })
    await expect(dialog.getByRole('alert')).toContainText('repair')
    await expect(dialog.getByRole('button', { name: 'Install / Repair helper', exact: true })).toBeEnabled()
  } finally { await app?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
})

test('browser settings install helper, choose a profile and assign its tab to the current chat', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-native-ui-'))
  const data = path.join(root, 'app'); const project = path.join(root, 'project'); mkdirSync(data); mkdirSync(project)
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({ provider: { mock: { apiKey: 'fixture', baseUrl: 'http://127.0.0.1:1', models: ['fixture'] } }, model: 'mock' }))
  writeFileSync(path.join(data, 'workspaces.json'), JSON.stringify([{ name: 'Native project', projectPath: project, agents: [{ id: 'a1', name: 'bs', templateId: 'bs', kind: 'native', cwd: project }] }]))
  const sockets: net.Socket[] = []
  const assignments: Array<{ client: string; owner: string; tabId: number }> = []
  let rejectAssignment = true
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    await page.getByRole('button', { name: 'New session', exact: true }).and(page.locator('[aria-label="New session"]')).click()
    const sessions = await page.evaluate(async project => window.api.listProjectSessions(project), project)
    const sessionId = sessions[0].id
    const config = getNativeConnectionConfig(data)
    const connect = async (id: string) => {
      const socket = net.createConnection(config.endpoint); sockets.push(socket)
      const decoder = new NativeFrameDecoder()
      socket.on('error', () => {})
      socket.on('data', buffer => {
        for (const value of decoder.push(Buffer.from(buffer))) {
          const message = value as any
          if (message.type === 'host_ready' && message.ok) socket.write(encodeNativeFrame({ type: 'hello', protocolVersion: 1, clientId: id, browserEpoch: 'test-browser', extensionVersion: '1.0.0', label: `Chrome ${id}`, capabilities: ['session-tabs', 'snapshot-generation', 'cdp-events'] }))
          if (message.type === 'cmd') {
            if (message.name === 'claimTab') assignments.push({ client: id, owner: message.ownerId, tabId: message.params.tabId })
            const result = message.name === 'listTabs' ? { ok: true, data: [{ id: 31, title: `${id} fixture tab`, url: 'https://example.com/fixture', active: true }] }
              : rejectAssignment ? { ok: false, error: 'Tab is owned by another session' } : { ok: true, data: { tabId: 31 } }
            socket.write(encodeNativeFrame({ type: 'result', id: message.id, epoch: message.epoch, ownerId: message.ownerId, ...result }))
          }
        }
      })
      await new Promise<void>(resolve => socket.once('connect', resolve))
      socket.write(encodeNativeFrame({ type: 'host_auth', token: config.token, origin: `chrome-extension://${NATIVE_EXTENSION_ID}/` }))
    }
    await connect('Work'); await connect('Personal')
    await expect.poll(() => page.evaluate(async () => (await window.api.getBrowserStatus()).connections?.length)).toBe(2)
    const status = await page.evaluate(() => window.api.getBrowserStatus())
    await app.evaluate(({ ipcMain, BrowserWindow }, args) => {
      ipcMain.removeHandler(args.setup)
      ipcMain.handle(args.setup, () => {
        const next = { ...args.status, nativeHostInstalled: true }
        BrowserWindow.getAllWindows()[0].webContents.send(args.changed, next)
        return next
      })
    }, { setup: Channels.BrowserNativeSetup, changed: Channels.EventBrowserStatus, status })
    await page.getByRole('button', { name: /^browser:/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Browser connection', exact: true })
    await expect(dialog).toContainText('Native Messaging')
    await expect(dialog.getByRole('button', { name: 'Pair With Code' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Install / Repair helper', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Helper installed')
    await dialog.getByLabel('Connected profile', { exact: true }).selectOption('Personal')
    await dialog.getByLabel('Tab for current chat', { exact: true }).selectOption('31')
    await dialog.getByRole('button', { name: 'Assign tab to current chat', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('owned by another session')
    rejectAssignment = false
    await dialog.getByRole('button', { name: 'Assign tab to current chat', exact: true }).click()
    await expect(dialog.getByRole('status')).toContainText('Tab assigned to this chat')
    expect(assignments.at(-1)).toEqual({ client: 'Personal', owner: sessionId, tabId: 31 })
    await dialog.getByRole('button', { name: 'Refresh tabs', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Assign tab to current chat', exact: true })).toBeFocused()
    await page.screenshot({ path: 'docs/evidence/v1.3.8-native-browser-settings.png' })
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(0, 0); win.setSize(620, 760) })
    await expect(dialog.getByRole('button', { name: 'Assign tab to current chat', exact: true })).toBeInViewport()
    await page.screenshot({ path: 'docs/evidence/v1.3.8-native-browser-narrow.png' })
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  } finally { sockets.forEach(socket => socket.destroy()); await app?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
})
