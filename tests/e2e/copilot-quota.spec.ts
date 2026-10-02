import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('Copilot refresh displays account quota/credits and retains stale quota on API failure', async () => {
  const data = mkdtempSync(path.join(tmpdir(), 'bs-copilot-quota-ui-'))
  mkdirSync(path.join(data, 'connections'))
  writeFileSync(path.join(data, 'bs.json'), JSON.stringify({ agents: {} }))
  writeFileSync(path.join(data, 'connections/accounts.json'), JSON.stringify({ version: 1, connections: [{ providerId: 'github-copilot', activeAccountId: 'copilot-fixture', accounts: [{ id: 'copilot-fixture', providerId: 'github-copilot', label: 'Copilot quota fixture', authMode: 'oauth', status: 'active', keyRef: 'fixture:copilot', profile: { email: 'quota@example.test' }, models: ['gpt-4.1'], createdAt: 1, lastUsedAt: 1 }] }] }))
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: data } })
    const encoded = await app.evaluate(({ safeStorage }) => safeStorage.encryptString(JSON.stringify({ githubAccessToken: 'fixture-identity', accessToken: 'fixture-runtime', expiresAt: Date.now() + 3_600_000 })).toString('base64'))
    writeFileSync(path.join(data, 'connections/vault.json'), JSON.stringify({ 'fixture:copilot': encoded }))
    await app.evaluate(() => {
      const actual = globalThis.fetch
      const state = globalThis as typeof globalThis & { quotaFailure: boolean; quotaCountOnly: boolean }
      state.quotaFailure = false
      state.quotaCountOnly = false
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url === 'https://api.githubcopilot.com/models') return Response.json({ data: [
          { id: 'gpt-4.1', name: 'GPT fixture', model_picker_enabled: true, capabilities: { type: 'chat', supports: { streaming: true, tool_calls: true } } }
        ] })
        if (url === 'https://api.github.com/copilot_internal/user') {
          if (new Headers(init?.headers).get('authorization') !== 'token fixture-identity') return new Response('', { status: 401 })
          if (new Headers(init?.headers).get('x-github-api-version') !== '2022-11-28') return new Response('', { status: 400 })
          if (state.quotaFailure) return new Response('', { status: 503 })
          if (state.quotaCountOnly) return Response.json({ copilot_plan: 'pro', quota_snapshots: { premium_interactions: { quota_remaining: 200 } } })
          return Response.json({ copilot_plan: 'pro', quota_reset_date: '2026-11-01', quota_snapshots: { premium_interactions: { entitlement: 300, quota_remaining: 240, percent_remaining: 80, credits_used: 12.5 }, chat: { unlimited: true }, completions: { unlimited: true } } })
        }
        return actual(input, init)
      }
    })
    const page = await app.firstWindow()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
    await settings.getByRole('button', { name: 'Providers', exact: true }).click()
    const refresh = settings.getByRole('button', { name: 'Refresh', exact: true })
    await refresh.click()
    await expect(settings.getByRole('progressbar', { name: 'Premium requests remaining', exact: true })).toHaveAttribute('aria-valuenow', '80')
    await expect(settings).toContainText('240 / 300 remaining')
    await expect(settings.locator('.quota-window').filter({ hasText: 'Chat' })).toContainText('Unlimited')
    await expect(settings.locator('.quota-window').filter({ hasText: 'Completions' })).toContainText('Unlimited')
    await expect(settings.getByLabel('Copilot credits', { exact: true })).toContainText('12.5')
    await expect(settings).toContainText('Credit allowance / remaining not reported by GitHub')
    await page.screenshot({ path: 'docs/evidence/v1.3.9-copilot-quota.png' })
    await app.evaluate(() => { (globalThis as typeof globalThis & { quotaFailure: boolean }).quotaFailure = true })
    await refresh.click()
    await expect(settings).toContainText('Stale')
    await expect(settings).toContainText('240 / 300 remaining')
    await expect(settings).toContainText('HTTP 503')
    await page.screenshot({ path: 'docs/evidence/v1.3.9-copilot-quota-stale.png' })
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(0, 0); win.setSize(620, 760) })
    await refresh.scrollIntoViewIfNeeded()
    await expect(refresh).toBeInViewport()
    await page.screenshot({ path: 'docs/evidence/v1.3.9-copilot-quota-narrow.png' })
    await app.evaluate(() => {
      const state = globalThis as typeof globalThis & { quotaFailure: boolean; quotaCountOnly: boolean }
      state.quotaFailure = false; state.quotaCountOnly = true
    })
    await refresh.click()
    await expect(settings).toContainText('200 remaining')
    await expect(settings.getByRole('progressbar', { name: 'Premium requests remaining', exact: true })).toHaveCount(0)
    await expect(settings.locator('.quota-account-subline')).not.toContainText('Stale')
  } finally { await app?.close(); rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) }
})
