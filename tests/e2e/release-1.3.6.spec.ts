import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { Channels } from '../../src/shared/ipc'

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v136-'))
  const userData = path.join(root, 'data')
  const project = path.join(root, 'project')
  const destination = path.join(root, 'destination')
  for (const dir of [userData, project, destination]) mkdirSync(dir)
  writeFileSync(path.join(project, 'sample.txt'), 'project content')
  writeFileSync(path.join(destination, 'sample.txt'), 'project content')
  const seed = (config: Record<string, unknown> = {}) => {
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{ projectPath: project, name: 'Project before', agents: [{ id: 'a1', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }] }]))
    writeFileSync(path.join(userData, 'bs.json'), JSON.stringify(config))
  }
  const launch = () => electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
  return { root, userData, project, destination, seed, launch }
}

test('project edits retain history, validate folders, block a live terminal and persist after restart', async () => {
  const f = fixture()
  let app: ElectronApplication | undefined
  f.seed()
  const answer = 'Result **with Markdown**\n\n```ts\nconst answer = 42\n```'
  const execution = { turnId: 'turn-1', agentId: 'a1', agentName: 'bs', speed: 'standard', startedAt: 1000, completedAt: 5000, status: 'completed' }
  writeFileSync(path.join(f.userData, 'sessions.json'), JSON.stringify([{ schemaVersion: 2, id: 'session-1', agentId: 'a1', lastAgentId: 'a1', projectPath: f.project, title: 'Retained session', createdAt: 1000, updatedAt: 5000, items: [
    { kind: 'message', message: { id: 'user-1', role: 'user', text: 'Keep my history', turnId: 'turn-1', execution, createdAt: 1000 } },
    { kind: 'message', message: { id: 'answer-1', role: 'assistant', text: answer, turnId: 'turn-1', execution, createdAt: 5000 } }
  ] }]))
  try {
    app = await f.launch()
    let page = await app.firstWindow()
    await page.locator('.project-row').click()
    await expect(page.locator('.chat-msg.final')).toContainText('Result with Markdown')
    await page.getByRole('button', { name: 'Copy response', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveText('Copied')
    expect((await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, '\n')).toBe(answer)
    // Clipboard failure is recoverable and leaves the response available.
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('Clipboard unavailable') } }) })
    await page.getByRole('button', { name: 'Copy response', exact: true }).click()
    await expect(page.locator('.chat-response-actions')).toContainText('Could not copy')

    await page.getByRole('button', { name: 'menu Project before', exact: true }).click()
    await page.getByRole('button', { name: 'Edit project', exact: true }).click()
    let dialog = page.getByRole('dialog', { name: 'Edit project', exact: true })
    await dialog.getByLabel('Name', { exact: true }).fill('Project renamed')
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.project-name')).toHaveText('Project renamed')

    await page.getByRole('button', { name: 'menu Project renamed', exact: true }).click()
    await page.getByRole('button', { name: 'Edit project', exact: true }).click()
    dialog = page.getByRole('dialog', { name: 'Edit project', exact: true })
    await dialog.getByLabel('Folder', { exact: true }).fill(path.join(f.root, 'missing'))
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('existing, accessible')
    expect(JSON.parse(readFileSync(path.join(f.userData, 'workspaces.json'), 'utf8'))[0].projectPath).toBe(f.project)

    const terminal = await page.evaluate(project => window.api.openTerminal(project), f.project)
    await dialog.getByLabel('Folder', { exact: true }).fill(f.destination)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('close its terminals')
    await page.evaluate(id => window.api.closeTerminal(id), terminal.id)
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.project-path')).toHaveText(f.destination)
    await expect(page.locator('.chat-msg.final')).toContainText('Result with Markdown')
    const workspaces = JSON.parse(readFileSync(path.join(f.userData, 'workspaces.json'), 'utf8'))
    expect(workspaces[0].agents[0]).toMatchObject({ id: 'a1', cwd: f.destination })
    expect(JSON.parse(readFileSync(path.join(f.userData, 'sessions.json'), 'utf8'))[0]).toMatchObject({ id: 'session-1', projectPath: f.destination })
    await app.close()
    app = await f.launch()
    page = await app.firstWindow()
    await page.locator('.project-row').click()
    await expect(page.locator('.chat-msg.final')).toContainText('Result with Markdown')
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toBeVisible()
    // Changes are app metadata only; neither project tree was moved or modified.
    expect(readFileSync(path.join(f.project, 'sample.txt'), 'utf8')).toBe('project content')
  } finally {
    await app?.close()
    rmSync(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

test('appearance previews, validates, saves and resets colors with usable narrow Settings', async ({}, testInfo) => {
  const f = fixture()
  let app: ElectronApplication | undefined
  f.seed({ agents: {} })
  try {
    app = await f.launch()
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    let settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Appearance', exact: true }).click()
    await settings.getByLabel('Background', { exact: true }).fill('#f4f5f6')
    await settings.getByLabel('Text', { exact: true }).fill('#19202a')
    await settings.getByLabel('Buttons', { exact: true }).fill('#6b46c1')
    await expect(settings.getByRole('region', { name: 'Color preview' }).getByRole('button', { name: 'Primary button' })).toHaveCSS('background-color', 'rgb(107, 70, 193)')
    await page.screenshot({ path: testInfo.outputPath('appearance-wide.png'), animations: 'disabled' })
    await expect(settings.getByRole('region', { name: 'Color preview', exact: true })).toHaveCSS('background-color', 'rgb(238, 239, 240)')
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--bg'))).toBe('#0b0e13')
    await settings.getByLabel('Text', { exact: true }).fill('invalid')
    await expect(settings.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await expect(settings.getByLabel('Text', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await settings.getByLabel('Text', { exact: true }).fill('#19202a')
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(settings.locator('.settings-status')).toHaveText('Settings saved.')
    expect(JSON.parse(readFileSync(path.join(f.userData, 'bs.json'), 'utf8')).appearance).toEqual({ background: '#f4f5f6', text: '#19202a', button: '#6b46c1' })
    await page.mouse.move(0, 0)
    await expect(settings.getByRole('button', { name: 'Save', exact: true })).toHaveCSS('background-color', 'rgb(107, 70, 193)')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await page.reload()
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg'))).toBe('#f4f5f6')
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Appearance', exact: true }).click()
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(0, 0); win.setSize(620, 660) })
    await expect(settings.locator('.settings-nav')).toHaveCSS('flex-direction', 'row')
    const bounds = await settings.boundingBox()
    expect(bounds?.width).toBeLessThanOrEqual(620)
    await expect(settings.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
    await settings.getByRole('button', { name: 'Save', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
    await settings.getByRole('button', { name: 'Restore default colors', exact: true }).click()
    await expect(settings.getByLabel('Background', { exact: true })).toHaveValue('#0b0e13')
    await page.keyboard.press('Escape')
    const discard = page.getByRole('dialog', { name: 'Discard unsaved settings?', exact: true })
    await expect(discard).toBeVisible()
    await discard.getByRole('button', { name: 'Keep editing', exact: true }).click()
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--bg'))).toBe('#0b0e13')
    await expect(settings.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
    await settings.locator('.settings-content').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: testInfo.outputPath('appearance-narrow.png'), animations: 'disabled' })
  } finally {
    await app?.close()
    rmSync(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})

test('native chat shows thinking, tool work and a copyable final from the real local stream', async ({}, testInfo) => {
  const f = fixture()
  let app: ElectronApplication | undefined
  let releaseReasoning!: () => void
  let releaseFinal!: () => void
  let requests = 0
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const input = JSON.parse(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (delta: object, finish_reason?: string) => res.write(`data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta, finish_reason: finish_reason ?? null }] })}\n\n`)
      if (JSON.stringify(input.messages).includes('Reply with a short title')) {
        send({ content: 'Test session' }); send({}, 'stop')
      } else if (requests++ % 2 === 0) {
        send({ role: 'assistant', reasoning_content: 'I will check the project file.' })
        if (requests === 1) await new Promise<void>(resolve => { releaseReasoning = resolve })
        send({ content: requests === 1 ? 'Reading the project file now.' : 'Checking again.' })
        send({ tool_calls: [{ index: 0, id: `read-${requests}`, type: 'function', function: { name: 'read', arguments: JSON.stringify({ file_path: path.join(f.project, 'sample.txt') }) } }] })
        send({}, 'tool_calls')
      } else {
        if (requests === 2) {
          await new Promise<void>(resolve => { releaseFinal = resolve })
          send({ content: 'Final result **verified**.\n\nThe file contains project content.' })
        }
        send({}, 'stop')
      }
      res.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  f.seed({ provider: { mock: { apiKey: 'fixture', baseUrl: `http://127.0.0.1:${address.port}`, models: ['mock-model'] } }, model: 'mock', lsp: { enabled: false }, compaction: { auto: false } })
  writeFileSync(path.join(f.userData, 'sessions.json'), JSON.stringify([{ schemaVersion: 2, id: 'stream-session', agentId: 'a1', lastAgentId: 'a1', projectPath: f.project, title: 'Stream history', createdAt: 1, updatedAt: 2, items: [{ kind: 'message', message: { id: 'earlier-user', role: 'user', text: 'Earlier request retained in history', turnId: 'earlier-turn', createdAt: 1, execution: { turnId: 'earlier-turn', agentId: 'a1', agentName: 'bs', speed: 'standard', startedAt: 1, completedAt: 2, status: 'failed' } } }] }]))
  try {
    app = await f.launch()
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    await page.locator('.chat-input-field').fill('Read sample.txt and report its content')
    await page.locator('.chat-input-field').press('Enter')
    await expect(page.locator('.chat-running')).toContainText('Thinking')
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveCount(0)
    // Delay the real history handler to reproduce joining a turn while events
    // are arriving. The original handler still supplies the actual transcript.
    await app.evaluate(({ ipcMain }, channel) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers
      const original = handlers.get(channel)!
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async (event, ...args) => {
        const result = structuredClone(await original(event, ...args))
        await new Promise(resolve => setTimeout(resolve, JSON.stringify(result).includes('Checking again.') ? 900 : 300))
        return result
      })
    }, Channels.SessionTranscript)
    await page.reload()
    await page.locator('.project-row').click()
    await expect(page.locator('.chat-panel')).toBeVisible()
    releaseReasoning()
    await expect(page.locator('.tool-call-header')).toContainText('Completed')
    await expect(page.locator('.chat-running')).toContainText('Working')
    const progress = page.locator('.chat-msg.update').filter({ hasText: 'Reading the project file now.' })
    await expect(progress).toBeVisible()
    await expect(page.locator('.chat-msg.user').filter({ hasText: 'Earlier request retained in history' })).toBeVisible()
    expect(await progress.evaluate(el => Boolean(el.compareDocumentPosition(el.parentElement!.querySelector('.tool-call')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
    await expect.poll(() => Boolean(releaseFinal)).toBe(true)
    releaseFinal()
    await expect(page.locator('.chat-msg.final')).toContainText('Final result verified')
    await expect(page.locator('.chat-running')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath('chat-final.png'), animations: 'disabled' })
    await page.getByRole('button', { name: 'Copy response', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveText('Copied')
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('Final result **verified**')
    await page.locator('.chat-input-field').fill('Check again using only tools')
    await page.locator('.chat-input-field').press('Enter')
    await expect(page.locator('.chat-msg.assistant').filter({ hasText: 'Checking again.' })).toBeVisible()
    await expect.poll(() => page.evaluate(async project => {
      const sessions = await window.api.listProjectSessions(project)
      return sessions[0].running
    }, f.project)).toBe(false)
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveCount(1)
    // Undo's wired control is currently hidden by the product toolbar CSS.
    // Invoke that callback to exercise its asynchronous history refresh.
    await page.locator('.chat-history-actions button').first().evaluate(button => (button as HTMLButtonElement).click())
    await expect(page.locator('.chat-msg.assistant').filter({ hasText: 'Checking again.' })).toHaveCount(0)
    // The older completion request takes 900ms; the newer undo snapshot takes
    // 300ms. Verify that the late completion cannot reinsert the removed turn.
    await page.waitForTimeout(950)
    await expect(page.locator('.chat-msg.assistant').filter({ hasText: 'Checking again.' })).toHaveCount(0)
    await page.reload()
    await page.locator('.project-row').click()
    await expect(page.locator('.chat-msg.final')).toContainText('Final result verified')
  } finally {
    releaseReasoning?.()
    releaseFinal?.()
    await app?.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(f.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
