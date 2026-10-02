import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('Copilot Refresh discovers the remote catalog and preserves an available selected model', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-copilot-catalog-'))
  const data = path.join(root, 'app'); const project = path.join(root, 'project')
  mkdirSync(data); mkdirSync(project); mkdirSync(path.join(data, 'connections'))
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({ agents: { bs: { provider: 'github-copilot', accountId: 'copilot-fixture', quotaPoolId: 'account', model: 'gpt-4.1', systemPrompt: 'Fixture only.' } } }))
  writeFileSync(path.join(data, 'connections/accounts.json'), JSON.stringify({ version: 1, connections: [{ providerId: 'github-copilot', activeAccountId: 'copilot-fixture', accounts: [{ id: 'copilot-fixture', providerId: 'github-copilot', label: 'Catalog fixture', profile: { email: 'catalog@example.test', planName: 'pro' }, authMode: 'oauth', status: 'active', keyRef: 'fixture:catalog', models: ['gpt-4.1', 'claude-sonnet-4'], createdAt: 1, lastUsedAt: 1 }] }] }))
  writeFileSync(path.join(data, 'workspaces.json'), JSON.stringify([{ name: 'Catalog project', projectPath: project, agents: [{ id: 'fixture-bs', name: 'bs', kind: 'native', templateId: 'bs', cwd: project }] }]))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    const encoded = await app.evaluate(({ safeStorage }) => safeStorage.encryptString(JSON.stringify({ accessToken: 'fixture-runtime', githubAccessToken: 'fixture-identity', expiresAt: Date.now() + 3_600_000, planName: 'pro' })).toString('base64'))
    writeFileSync(path.join(data, 'connections/vault.json'), JSON.stringify({ 'fixture:catalog': encoded }))
    await app.evaluate(() => {
      const actual = globalThis.fetch
      const state = globalThis as typeof globalThis & { catalogFailure: boolean; removeSelected: boolean }
      state.catalogFailure = false
      state.removeSelected = false
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url === 'https://api.githubcopilot.com/models') {
          if (new Headers(init?.headers).get('authorization') !== 'Bearer fixture-runtime') return new Response('', { status: 401 })
          if (state.catalogFailure) return new Response('', { status: 503 })
          const model = (id: string, name: string, extra: object = {}) => ({ id, name, model_picker_enabled: true, policy: { state: 'enabled' }, capabilities: { type: 'chat', supports: { streaming: true, tool_calls: true }, limits: { max_context_window_tokens: 200000, max_output_tokens: 64000 } }, ...extra })
          return Response.json({ data: [model('gpt-4.1', 'GPT fixture refreshed', state.removeSelected ? { model_picker_enabled: false } : {}), model('claude-fixture', 'Claude fixture discovered'), model('gemini-fixture', 'Gemini fixture discovered'), model('response-fixture', 'Responses fixture discovered', { supported_endpoints: ['/responses'] }), model('hidden', 'Hidden model', { model_picker_enabled: false }), model('disabled', 'Disabled model', { policy: { state: 'disabled' } }), model('messages-only', 'Unsupported messages-only model', { supported_endpoints: ['/messages'] }), model('missing-picker', 'Missing picker permission', { model_picker_enabled: undefined }), model('missing-policy', 'Missing policy permission', { policy: undefined }), model('empty-policy', 'Empty policy permission', { policy: {} })] })
        }
        if (url === 'https://api.github.com/copilot_internal/user') return Response.json({ copilot_plan: 'pro', quota_snapshots: { premium_interactions: { entitlement: 300, quota_remaining: 300 } } })
        return actual(input, init)
      }
    })
    const page = await app.firstWindow()
    await page.locator('.project-row').click()
    await expect(page.getByLabel('Agent model', { exact: true })).toHaveValue('gpt-4.1')
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Providers', exact: true }).click()
    await settings.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(settings).toContainText('4 code models')
    await settings.getByRole('button', { name: 'View', exact: true }).click()
    await expect(settings).toContainText('Responses fixture discovered')
    await expect(settings.getByText('Hidden model', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('Missing picker permission', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('Missing policy permission', { exact: true })).toHaveCount(0)
    await expect(settings.getByText('Empty policy permission', { exact: true })).toHaveCount(0)
    const snapshot = await page.evaluate(() => window.api.getProviderSnapshot())
    expect(snapshot.providers.find(provider => provider.id === 'github-copilot')?.capabilities.modelDiscovery).toBe('remote')
    expect(snapshot.accounts[0].models.map(model => model.id)).toEqual(['gpt-4.1', 'claude-fixture', 'gemini-fixture', 'response-fixture'])
    await page.screenshot({ path: 'docs/evidence/v1.3.9-copilot-catalog.png' })
    await app.evaluate(() => { (globalThis as typeof globalThis & { catalogFailure: boolean }).catalogFailure = true })
    await settings.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(settings.getByLabel('Refresh stages for catalog@example.test')).toContainText('models · error')
    const retained = await page.evaluate(() => window.api.getProviderSnapshot())
    expect(retained.accounts[0].models.map(model => model.id)).toEqual(snapshot.accounts[0].models.map(model => model.id))
    expect(retained.accounts[0].error?.message).toContain('503')
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByLabel('Agent model', { exact: true })).toHaveValue('gpt-4.1')
    await expect(page.getByLabel('Agent model', { exact: true }).locator('option')).toHaveCount(4)
    await app.evaluate(() => {
      const state = globalThis as typeof globalThis & { catalogFailure: boolean; removeSelected: boolean }
      state.catalogFailure = false; state.removeSelected = true
    })
    await page.evaluate(() => window.api.refreshProviderAccount('github-copilot', 'copilot-fixture'))
    await expect(page.getByLabel('Agent model', { exact: true }).getByRole('option', { name: 'gpt-4.1 (unavailable)', exact: true })).toBeDisabled()
  } finally { await app?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
})
