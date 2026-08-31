import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('V2 bootstrap selects the locked shell and exposes no legacy renderer API', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-bootstrap-'))
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    app = await electron.launch({ args: ['.'], env: {
      ...process.env as Record<string, string>, BS_USER_DATA: userData
    } })
    const window = await app.firstWindow()
    await expect(window).toHaveTitle(/BS Coding/)
    await expect(window.getByTestId('v2-app-shell')).toBeVisible()
    await expect(window.getByTestId('v2-titlebar')).toBeVisible()
    await expect(window.locator('.sidebar')).toHaveCount(0)
    await expect(window.locator('.v2-primary-nav button')).toHaveCount(5)
    await expect(window.getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('button', { name: 'States' })).toHaveCount(0)
    const result = await window.evaluate(async () => {
      const browser = globalThis as unknown as { api?: unknown; bs: { v2: Record<string, unknown> & {
        'project.list'(request: Record<string, never>): Promise<unknown>
      } } }
      return { legacyApiExposed: browser.api !== undefined,
        namespaces: Object.keys(browser.bs.v2).sort(),
        projects: await browser.bs.v2['project.list']({}),
        serialized: JSON.stringify(browser.bs.v2) }
    })
    expect(result.legacyApiExposed).toBe(false)
    expect(result.namespaces).toEqual(expect.arrayContaining([
      'enabled', 'provider', 'workSession', 'workflow', 'project.list',
      'workSession.runtimeTargets', 'settings.get', 'remote.status'
    ]))
    expect(result.projects).toMatchObject({ projects: [] })
    expect(JSON.stringify(result)).not.toMatch(/raw-secret|filesystem|fshandle|process|ipcrenderer/i)
  } finally {
    await app?.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
