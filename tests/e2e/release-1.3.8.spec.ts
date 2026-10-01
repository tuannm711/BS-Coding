import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'

test('quick messages are centered on each wrapping row below mode and agent controls', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v138-layout-'))
  const data = path.join(root, 'data')
  const project = path.join(root, 'project')
  mkdirSync(data); mkdirSync(project)
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({
    provider: { fixture: { apiKey: 'fixture-only', baseUrl: 'http://127.0.0.1:1/v1', models: ['fixture-model'] } }, model: 'fixture',
    agents: { helper: { systemPrompt: 'Fixture only.' } },
    quickMessages: [{ id: 'a', name: 'Continue', message: 'Continue.' }, { id: 'b', name: 'Review', message: 'Review.' }, { id: 'c', name: 'Next step', message: 'Next step.' }]
  }))
  writeFileSync(path.join(data, 'workspaces.json'), JSON.stringify([{ name: 'Layout project', projectPath: project, agents: [{ id: 'helper', name: 'helper', templateId: 'bs', kind: 'native', cwd: project }] }]))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    const group = page.getByRole('group', { name: 'Quick messages', exact: true })
    await expect(group.getByRole('button')).toHaveCount(3)
    const checkCenter = async () => {
      const geometry = await group.evaluate(element => {
        const group = element.getBoundingClientRect()
        const rows = new Map<number, { left: number; right: number }>()
        for (const button of element.querySelectorAll('button')) {
          const box = button.getBoundingClientRect()
          const top = Math.round(box.top)
          const row = rows.get(top)
          rows.set(top, { left: Math.min(row?.left ?? box.left, box.left), right: Math.max(row?.right ?? box.right, box.right) })
        }
        return { center: (group.left + group.right) / 2, rows: [...rows.values()], overflow: element.scrollWidth > element.clientWidth }
      })
      expect(geometry.overflow).toBe(false)
      for (const row of geometry.rows) expect(Math.abs((row.left + row.right) / 2 - geometry.center)).toBeLessThanOrEqual(1)
      const mode = await page.locator('.chat-mode').boundingBox()
      const row = await group.boundingBox()
      expect(row!.y).toBeGreaterThanOrEqual(mode!.y + mode!.height)
    }
    await checkCenter()
    await page.screenshot({ path: 'docs/evidence/v1.3.8-quick-centered-wide.png' })
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(0, 0); win.setSize(760, 720) })
    await checkCenter()
    await page.screenshot({ path: 'docs/evidence/v1.3.8-quick-centered-narrow.png' })
  } finally { await app?.close(); rmSync(root, { recursive: true, force: true }) }
})

test('a long streamed final continues after output limit and copies the complete response', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v138-long-'))
  const data = path.join(root, 'data')
  const project = path.join(root, 'project')
  mkdirSync(data); mkdirSync(project)
  const first = Array.from({ length: 450 }, (_, index) => `Dòng ${index}: bookkeeper, phản hồi tiếng Việt có đầy đủ ký tự và nội dung, không bỏ phần cuối.\n`).join('')
  const tail = '\n**END-OF-RESPONSE** — phần cuối đã được tiếp tục đầy đủ.\n'
  const requests: Array<{ messages: unknown; tools?: unknown[] }> = []
  const server = http.createServer((request, response) => {
    let body = ''
    request.on('data', chunk => { body += String(chunk) })
    request.on('end', () => {
      const input = JSON.parse(body)
      const title = JSON.stringify(input.messages).includes('Reply with a short title')
      if (!title) requests.push(input)
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const send = (delta: object, finish_reason: string | null = null, usage?: object) => response.write(`data: ${JSON.stringify({ id: 'long', choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) })}\n\n`)
      const text = title ? 'Long response test' : requests.length === 1 ? first : tail
      for (let offset = 0; offset < text.length; offset += 37) send({ content: text.slice(offset, offset + 37) })
      send({}, !title && requests.length === 1 ? 'length' : 'stop', { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 })
      response.end('data: [DONE]\n\n')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({ provider: { mock: { apiKey: 'fixture-only', baseUrl: `http://127.0.0.1:${port}/v1`, models: ['mock-model'] } }, model: 'mock', agents: { helper: { systemPrompt: 'Fixture only. Respond without tools.' } }, compaction: { auto: false } }))
  writeFileSync(path.join(data, 'workspaces.json'), JSON.stringify([{ name: 'Long response project', projectPath: project, agents: [{ id: 'helper', name: 'helper', templateId: 'bs', kind: 'native', cwd: project }] }]))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    await page.locator('.chat-input-field').fill('Write the entire long response.')
    await page.locator('.chat-input-field').press('Enter')
    await expect(page.locator('.chat-msg.final')).toContainText('END-OF-RESPONSE')
    expect(requests).toHaveLength(2)
    expect(requests[1].tools ?? []).toEqual([])
    await expect(page.locator('.chat-msg.user')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Copy response', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Copy response', exact: true })).toHaveText('Copied')
    // Windows clipboard normalizes LF to CRLF; all text/Markdown must otherwise be exact.
    expect((await app.evaluate(({ clipboard }) => clipboard.readText())).replaceAll('\r\n', '\n')).toBe(first + tail)
    const sessions = await page.evaluate(async project => window.api.listProjectSessions(project), project)
    const transcript = await page.evaluate(async data => window.api.listSessionTranscript(data.project, data.session), { project, session: sessions[0].id })
    const assistant = transcript.flatMap(item => item.kind === 'message' && item.message.role === 'assistant' ? [item.message] : [])
    expect(assistant.map(message => message.text).join('')).toBe(first + tail)
    await page.screenshot({ path: 'docs/evidence/v1.3.8-long-response.png' })
  } finally {
    await app?.close()
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(root, { recursive: true, force: true })
  }
})

test('Antigravity account usage appears in the footer and survives restarting the same session', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v138-antigravity-'))
  const data = path.join(root, 'data')
  const project = path.join(root, 'project')
  mkdirSync(data); mkdirSync(project); mkdirSync(path.join(data, 'connections'))
  const model = 'gemini-3.1-pro-high'
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({ agents: { helper: { provider: 'antigravity', accountId: 'ag-fixture', quotaPoolId: 'gemini', model, systemPrompt: 'Fixture only.' } }, compaction: { auto: false } }))
  writeFileSync(path.join(data, 'connections/accounts.json'), JSON.stringify({ version: 1, connections: [{ providerId: 'antigravity', activeAccountId: 'ag-fixture', accounts: [{ id: 'ag-fixture', providerId: 'antigravity', label: 'Antigravity fixture', authMode: 'oauth', status: 'active', keyRef: 'fixture:ag', models: [model], modelCatalog: [{ id: model, name: 'Gemini 3.1 Pro High', capabilities: { contextWindow: 10000, maxOutputTokens: 65536, supportsTools: true, supportsStreaming: true } }], createdAt: 1, lastUsedAt: 1 }] }] }))
  writeFileSync(path.join(data, 'workspaces.json'), JSON.stringify([{ name: 'Antigravity project', projectPath: project, agents: [{ id: 'helper', name: 'helper', templateId: 'bs', kind: 'native', cwd: project }] }]))
  const injectTransport = async (app: ElectronApplication) => {
    await app.evaluate(() => {
      const actual = globalThis.fetch
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url.includes('cloudcode-pa.googleapis.com') && url.includes(':streamGenerateContent')) {
          const request = JSON.parse(String(init?.body ?? '{}'))
          const title = JSON.stringify(request).includes('Reply with a short title')
          const text = title ? 'Antigravity usage' : 'Antigravity fixture answer.'
          const frames = [
            { response: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] } },
            { response: { usageMetadata: { promptTokenCount: 100, cachedContentTokenCount: 40, candidatesTokenCount: 20, thoughtsTokenCount: 5, totalTokenCount: 125 } } }
          ]
          return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
        }
        if (url.endsWith(':fetchAvailableModels')) return Response.json({ models: {} })
        return actual(input, init)
      }
    })
    const secret = await app.evaluate(({ safeStorage }) => safeStorage.encryptString(JSON.stringify({ accessToken: 'fixture-only', expiresAt: Date.now() + 3_600_000, projectId: 'fixture-project' })).toString('base64'))
    writeFileSync(path.join(data, 'connections/vault.json'), JSON.stringify({ 'fixture:ag': secret }))
  }
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    await injectTransport(app)
    let page = await app.firstWindow()
    await page.locator('.project-row').click()
    await page.locator('.chat-input-field').fill('Reply using the fixture.')
    await page.locator('.chat-input-field').press('Enter')
    await expect(page.locator('.chat-msg.final')).toContainText('Antigravity fixture answer.')
    await expect(page.locator('.context-footer')).toContainText('125')
    await expect(page.locator('.context-footer')).toContainText('(1%)')
    await expect(page.getByTestId('context-session-tokens')).toContainText('125')
    await expect(page.getByTestId('context-session-tokens')).toContainText('100 in / 25 out')
    await expect(page.locator('.chat-panel')).toBeVisible()
    await page.locator('.context-footer-stack').screenshot({ path: 'docs/evidence/v1.3.8-antigravity-context.png' })
    await app.close()
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    await injectTransport(app)
    page = await app.firstWindow()
    await page.locator('.project-row').click()
    await expect(page.locator('.context-footer')).toContainText('125')
    await expect(page.getByTestId('context-session-tokens')).toContainText('100 in / 25 out')
    await page.getByRole('button', { name: 'New session', exact: true }).click()
    await expect(page.locator('.context-footer')).toContainText('—')
  } finally { await app?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
})
