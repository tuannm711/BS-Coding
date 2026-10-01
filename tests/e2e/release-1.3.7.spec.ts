import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import path from 'node:path'
import { Channels } from '../../src/shared/ipc'

function fixture(config: unknown) {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v137-'))
  const userData = path.join(root, 'data')
  const project = path.join(root, 'project')
  mkdirSync(userData); mkdirSync(project)
  writeFileSync(path.join(userData, 'bs.json'), JSON.stringify(config))
  writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{ projectPath: project, name: 'v1.3.7 Project', agents: [{ id: 'helper', name: 'helper', templateId: 'bs', kind: 'native', cwd: project }] }]))
  return { root, userData, project, launch: () => electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } }) }
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.getByRole('dialog', { name: 'Settings', exact: true })
}

test('quick messages occupy a separate row below selectors and steer within the same turn', async () => {
  let finishFirst: (() => void) | undefined
  const requests: Array<{ messages: Array<{ role: string; content: unknown }> }> = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', data => { body += String(data) })
    request.on('end', () => {
      const parsed = JSON.parse(body)
      if (!parsed.stream) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fixture title' }, finish_reason: 'stop', index: 0 }] })); return }
      requests.push(parsed)
      const chunk = (delta: unknown, finish_reason: string | null = null) => 'data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason }] }) + '\n\n'
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(chunk({ role: 'assistant', content: requests.length === 1 ? 'Working on the first request.' : 'Applied your guidance.' }))
      const finish = () => response.end(chunk({}, 'stop') + 'data: [DONE]\n\n')
      if (requests.length === 1) finishFirst = finish
      else finish()
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const f = fixture({ provider: { fixture: { apiKey: 'fixture-only', baseUrl: `http://127.0.0.1:${port}/v1`, models: ['fixture-model'] } }, model: 'fixture', agents: { helper: { systemPrompt: 'Fixture only. Reply without tools.' } }, quickMessages: [{ id: 'next', name: 'Continue with the next task', message: 'Use the revised approach.' }] })
  let app: ElectronApplication | undefined
  try {
    app = await f.launch()
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    const quick = page.getByRole('group', { name: 'Quick messages', exact: true })
    const assertRows = async () => {
      const mode = await page.locator('.chat-mode').boundingBox()
      const row = await quick.boundingBox()
      const input = await page.locator('.chat-input').boundingBox()
      expect(row!.y).toBeGreaterThanOrEqual(mode!.y + mode!.height)
      expect(input!.y).toBeGreaterThanOrEqual(row!.y + row!.height)
      const overflow = await quick.evaluate(element => element.scrollWidth > element.clientWidth)
      expect(overflow).toBe(false)
      const toolsOverflow = await page.locator('.chat-mode-tools').evaluate(element => element.scrollWidth > element.clientWidth)
      expect(toolsOverflow).toBe(false)
    }
    await assertRows()
    await page.screenshot({ path: 'docs/evidence/v1.3.7-chat-wide.png' })
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(0, 0); win.setSize(760, 720) })
    await assertRows()
    await page.screenshot({ path: 'docs/evidence/v1.3.7-chat-narrow.png' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
    const input = page.locator('.chat-input-field')
    await input.fill('Start the first request.')
    await input.press('Enter')
    await expect(page.getByRole('button', { name: 'Steer', exact: true })).toBeVisible()
    await expect.poll(() => Boolean(finishFirst)).toBe(true)
    await quick.getByRole('button').click()
    await expect(page.locator('.chat-queue-badge')).toHaveText('steer pending')
    await input.fill('Also run the checks.')
    await page.getByRole('button', { name: 'Steer', exact: true }).click()
    await expect(page.locator('.chat-queue-item')).toHaveCount(2)
    await page.locator('.chat-queue-text').last().click()
    await expect(input).toHaveValue('Also run the checks.')
    await input.fill('Run only the focused checks.')
    await page.getByRole('button', { name: 'Save message', exact: true }).click()
    await expect(page.locator('.chat-queue-item').last()).toContainText('Run only the focused checks.')
    await page.screenshot({ path: 'docs/evidence/v1.3.7-steer-pending.png' })
    finishFirst!()
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
    await expect(page.locator('.chat-queue-item')).toHaveCount(0)
    expect(requests.filter(request => 'tools' in request)).toHaveLength(2)
    expect(JSON.stringify(requests[1].messages)).toContain('Use the revised approach.')
    expect(JSON.stringify(requests[1].messages)).toContain('Run only the focused checks.')
    const sessions = await page.evaluate(async project => window.api.listProjectSessions(project), f.project)
    const transcript = await page.evaluate(async data => window.api.listSessionTranscript(data.project, data.session), { project: f.project, session: sessions[0].id })
    const users = transcript.flatMap(item => item.kind === 'message' && item.message.role === 'user' ? [item.message] : [])
    expect(users).toHaveLength(3)
    expect(new Set(users.map(message => message.execution?.turnId)).size).toBe(1)
    await page.screenshot({ path: 'docs/evidence/v1.3.7-steer-completed.png' })
  } finally {
    finishFirst?.()
    await app?.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(f.root, { recursive: true, force: true })
  }
})

test('Copilot device code supports copy, cancel, denied recovery and successful connection', async () => {
  const f = fixture({ agents: {} })
  let app: ElectronApplication | undefined
  try {
    app = await f.launch()
    await app.evaluate(() => {
      const actual = globalThis.fetch
      const state = globalThis as typeof globalThis & { copilotDecision: string; copilotGrants: number }
      state.copilotDecision = 'pending'; state.copilotGrants = 0
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url === 'https://github.com/login/device/code') return Response.json({ device_code: 'fixture-private-device', user_code: `CODE-000${++state.copilotGrants}`, verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 0.1 })
        if (url === 'https://github.com/login/oauth/access_token') return Response.json(state.copilotDecision === 'approved' ? { access_token: 'fixture-github' } : { error: state.copilotDecision === 'denied' ? 'access_denied' : 'authorization_pending' })
        if (url === 'https://api.github.com/user') return Response.json({ id: 7, login: 'fixture-octocat', email: 'fixture@example.com' })
        if (url.endsWith('/copilot_internal/v2/token')) return Response.json({ token: 'fixture-copilot', expires_at: 2_000_000_000, chat_enabled: true })
        if (url.endsWith('/copilot_internal/user')) return Response.json({ copilot_plan: 'pro' })
        return actual(input, init)
      }
    })
    const page = await app.firstWindow()
    const settings = await openSettings(page)
    await settings.getByRole('button', { name: 'Providers', exact: true }).click()
    const openCopilot = async () => {
      await settings.getByRole('button', { name: /Add provider/ }).click()
      await page.getByLabel('Provider', { exact: true }).selectOption('github-copilot')
      const dialog = page.getByRole('dialog', { name: 'Add GitHub Copilot', exact: true })
      await dialog.getByRole('button', { name: 'Create authorization link', exact: true }).click()
      return dialog
    }
    let dialog = await openCopilot()
    await expect(dialog.getByLabel('GitHub verification code', { exact: true })).toHaveValue('CODE-0001')
    const initialSnapshot = await page.evaluate(async () => window.api.getProviderSnapshot())
    await app.evaluate(({ BrowserWindow }, data) => BrowserWindow.getAllWindows()[0].webContents.send(data.channel, { ...data.snapshot, revision: data.snapshot.revision + 1 }), { channel: Channels.EventProviderSnapshotChanged, snapshot: initialSnapshot })
    await expect(dialog.getByLabel('Provider', { exact: true })).toHaveValue('github-copilot')
    await dialog.getByRole('button', { name: 'Copy code', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Code copied', exact: true })).toBeVisible()
    await page.screenshot({ path: 'docs/evidence/v1.3.7-copilot-device.png' })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(async () => (await window.api.getProviderSnapshot()).accounts)).toEqual([])
    dialog = await openCopilot()
    await app.evaluate(() => { (globalThis as typeof globalThis & { copilotDecision: string }).copilotDecision = 'denied' })
    await expect(dialog.getByRole('alert')).toContainText('denied')
    await app.evaluate(() => { (globalThis as typeof globalThis & { copilotDecision: string }).copilotDecision = 'pending' })
    await dialog.getByRole('button', { name: 'Generate new link', exact: true }).click()
    await expect(dialog.getByLabel('GitHub verification code', { exact: true })).toHaveValue('CODE-0003')
    await app.evaluate(() => { (globalThis as typeof globalThis & { copilotDecision: string }).copilotDecision = 'approved' })
    await expect(dialog).toHaveCount(0)
    const snapshot = await page.evaluate(async () => window.api.getProviderSnapshot())
    expect(snapshot.accounts).toHaveLength(1)
    expect(snapshot.accounts[0].providerId).toBe('github-copilot')
    await expect(settings).toContainText('fixture@example.com')
  } finally { await app?.close(); rmSync(f.root, { recursive: true, force: true }) }
})

test('closing Copilot while its grant is loading cancels the late session', async () => {
  const f = fixture({ agents: {} })
  let app: ElectronApplication | undefined
  try {
    app = await f.launch()
    await app.evaluate(() => {
      const actual = globalThis.fetch
      const state = globalThis as typeof globalThis & { releaseGrant: () => void }
      const gate = new Promise<void>(resolve => { state.releaseGrant = resolve })
      globalThis.fetch = async (input, init) => {
        if (String(input) === 'https://github.com/login/device/code') {
          await gate
          return Response.json({ device_code: 'fixture-private', user_code: 'TEST-CODE', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
        }
        return actual(input, init)
      }
    })
    const page = await app.firstWindow()
    await page.evaluate(() => {
      const state = globalThis as typeof globalThis & { authEvents: Array<{ status: string }> }
      state.authEvents = []
      window.api.onProviderAuthorizationChanged(event => state.authEvents.push(event))
    })
    const settings = await openSettings(page)
    await settings.getByRole('button', { name: 'Providers', exact: true }).click()
    await settings.getByRole('button', { name: /Add provider/ }).click()
    await page.getByLabel('Provider', { exact: true }).selectOption('github-copilot')
    const dialog = page.getByRole('dialog', { name: 'Add GitHub Copilot', exact: true })
    await dialog.getByRole('button', { name: 'Create authorization link', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Creating…', exact: true })).toBeVisible()
    await expect(dialog.getByLabel('Provider', { exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseGrant: () => void }).releaseGrant())
    await expect.poll(() => page.evaluate(() => (globalThis as typeof globalThis & { authEvents: Array<{ status: string }> }).authEvents.at(-1)?.status)).toBe('cancelled')
    expect(await page.evaluate(async () => (await window.api.getProviderSnapshot()).accounts)).toEqual([])
  } finally { await app?.close(); rmSync(f.root, { recursive: true, force: true }) }
})
