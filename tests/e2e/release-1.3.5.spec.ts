import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import path from 'node:path'
import { seedOpenAiFixtureAccount, writeOpenAiFixtureVault } from '../fixtures/electron-provider-account'

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  return page.locator('.settings-dialog')
}

test('each account quota has one agent, model selection is in chat, and all agents can be removed', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v135-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-v135-project-'))
  let app: ElectronApplication | undefined
  try {
    seedOpenAiFixtureAccount(userData, 'fixture-openai')
    writeFileSync(path.join(userData, 'bs.json'), JSON.stringify({ agents: {
      bs: { provider: 'openai', accountId: 'fixture-openai', quotaPoolId: 'account', model: 'gpt-5.6-sol', systemPrompt: 'Fixture prompt' }
    } }))
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{ projectPath: project, name: 'Quota Project', agents: [{ id: 'fixture-bs', name: 'bs', templateId: 'bs', kind: 'native', cwd: project }] }]))
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
    const page = await app.firstWindow()
    await writeOpenAiFixtureVault(app, userData)
    await page.locator('.project-row').click()
    await expect(page.getByLabel('Agent model')).toBeEnabled()
    await page.getByLabel('Agent model').selectOption('gpt-5.6-luna')
    await expect(page.getByLabel('Agent model')).toHaveValue('gpt-5.6-luna')
    await page.getByRole('button', { name: 'Fleet', exact: true }).click()
    await expect(page.locator('.fleet-agent-card')).toHaveCount(1)
    await expect(page.getByRole('region', { name: 'Agent bs', exact: true })).toContainText('bs')
    await page.screenshot({ path: 'docs/evidence/v1.3.5-fleet.png' })
    const settings = await openSettings(page)
    await settings.getByRole('button', { name: 'Agents', exact: true }).click()
    await expect(settings.getByRole('columnheader', { name: 'Quota', exact: true })).toBeVisible()
    await expect(settings.getByRole('columnheader', { name: 'Model', exact: true })).toHaveCount(0)
    await settings.getByRole('button', { name: '+ Add agent' }).click()
    const adding = page.getByRole('dialog', { name: 'Add agent', exact: true })
    await adding.getByLabel('Name', { exact: true }).fill('duplicate')
    await adding.getByLabel('Provider', { exact: true }).selectOption('openai')
    await adding.getByLabel('Account', { exact: true }).selectOption('fixture-openai')
    await expect(adding.getByLabel('Quota', { exact: true }).locator('option[value="account"]')).toBeDisabled()
    await expect(adding.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(adding).toHaveCount(0)
    await expect(settings).toBeVisible()
    await settings.getByRole('button', { name: 'Delete bs', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete bs?', exact: true }).getByRole('button', { name: 'Delete agent', exact: true }).click()
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(settings.getByRole('status')).toHaveText('Settings saved.')
    expect(JSON.parse(readFileSync(path.join(userData, 'bs.json'), 'utf8')).agents).toEqual({})
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.chat-panel')).toHaveCount(0)
    await page.reload()
    await page.locator('.project-row').click()
    await expect(page.locator('.chat-panel')).toHaveCount(0)
    await page.getByRole('button', { name: 'Fleet', exact: true }).click()
    await expect(page.locator('.fleet-empty')).toContainText('No agents in this project')
  } finally {
    await app?.close()
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('quick messages save, send to the selected session, queue while running, and support edit/delete', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v135-quick-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-v135-project-'))
  const requests: string[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', data => { body += String(data) })
    request.on('end', () => {
      const parsed = JSON.parse(body) as { stream?: boolean; messages?: Array<{ role: string; content: unknown }> }
      const latest = parsed.messages?.filter(message => message.role === 'user').at(-1)
      if (latest) requests.push(JSON.stringify(latest.content))
      if (!parsed.stream) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fixture title' }, finish_reason: 'stop', index: 0 }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })); return }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Working' }, finish_reason: null }] }) + '\n\n')
      setTimeout(() => {
        response.end('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n')
      }, 1500)
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  let app: ElectronApplication | undefined
  try {
    writeFileSync(path.join(userData, 'bs.json'), JSON.stringify({ provider: { fixture: { apiKey: 'fixture-only', baseUrl: `http://127.0.0.1:${port}/v1`, models: ['fixture-model'] } }, model: 'fixture', agents: { helper: { systemPrompt: 'Fixture only. Reply without tools.' } } }))
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{ projectPath: project, name: 'Quick Project', agents: [{ id: 'helper', name: 'helper', templateId: 'bs', kind: 'native', cwd: project }] }]))
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    const settings = await openSettings(page)
    await settings.getByRole('button', { name: 'Quick Messages', exact: true }).click()
    await settings.getByRole('button', { name: '+ Add button', exact: true }).click()
    const adding = page.getByRole('dialog', { name: 'Add quick message', exact: true })
    await expect(adding.getByRole('button', { name: 'Save button', exact: true })).toBeDisabled()
    await adding.getByLabel('Name', { exact: true }).fill('Continue')
    await adding.getByLabel('Message', { exact: true }).fill('Continue the next task.')
    await adding.getByRole('button', { name: 'Save button', exact: true }).click()
    await settings.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(settings.getByRole('status')).toHaveText('Settings saved.')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    const quick = page.getByRole('group', { name: 'Quick messages', exact: true }).getByRole('button', { name: 'Continue', exact: true })
    await expect(quick).toBeVisible()
    await page.setViewportSize({ width: 1000, height: 740 })
    await expect(quick).toBeVisible()
    await page.screenshot({ path: 'docs/evidence/v1.3.5-quick-messages.png' })
    await quick.click()
    await expect(page.locator('.chat-msg.user').last()).toContainText('Continue the next task.')
    await expect(quick).toBeEnabled()
    await quick.click()
    await expect(page.locator('.chat-queue-item')).toContainText('Continue the next task.')
    await expect(page.locator('.chat-queue-item')).toHaveCount(0, { timeout: 15000 })
    await expect.poll(() => requests.filter(message => message.includes('Continue the next task.')).length).toBeGreaterThanOrEqual(2)
    const sessions = await page.evaluate(async () => window.api.listProjectSessions((await window.api.listWorkspaces())[0].projectPath))
    const transcript = await page.evaluate(async data => window.api.listSessionTranscript(data.project, data.session), { project, session: sessions[0].id })
    expect(transcript.filter(item => item.kind === 'message' && item.message.role === 'user').map(item => item.kind === 'message' ? item.message.execution?.agentId : null)).toEqual(['helper', 'helper'])
    const reopened = await openSettings(page)
    await reopened.getByRole('button', { name: 'Quick Messages', exact: true }).click()
    await reopened.getByRole('button', { name: 'Edit Continue', exact: true }).click()
    const edit = page.getByRole('dialog', { name: 'Edit quick message', exact: true })
    await edit.getByLabel('Name', { exact: true }).fill('Next')
    await edit.getByLabel('Message', { exact: true }).fill('Run the next check.')
    await edit.getByRole('button', { name: 'Save button', exact: true }).click()
    await reopened.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(reopened.getByRole('status')).toHaveText('Settings saved.')
    await reopened.getByRole('button', { name: 'Delete Next', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete Next?', exact: true }).getByRole('button', { name: 'Delete button', exact: true }).click()
    await reopened.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(reopened.getByRole('status')).toHaveText('Settings saved.')
    await reopened.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('group', { name: 'Quick messages', exact: true }).getByRole('button')).toHaveCount(0)
  } finally {
    await app?.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
