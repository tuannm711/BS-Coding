import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedV2Backend } from '../fixtures/v2-seed'

test('V2 Settings controls updates and remote access through typed APIs', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-settings-'))
  const projectPath = mkdtempSync(path.join(tmpdir(), 'bs-v2-settings-project-'))
  seedV2Backend(userData, projectPath)
  const app = await electron.launch({ args: ['.'], env: {
    ...process.env as Record<string, string>, BS_USER_DATA: userData, BS_V2: '1'
  } })
  try {
    const window = await app.firstWindow()
    await window.getByRole('button', { name: 'Settings' }).click()

    await window.getByRole('button', { name: 'Updates', exact: true }).click()
    await expect(window.getByRole('heading', { name: 'Updates' })).toBeVisible()
    await window.getByRole('radio', { name: 'Beta' }).check()
    await expect(window.getByRole('radio', { name: 'Beta' })).toBeChecked()
    await window.getByRole('button', { name: 'Check for updates' }).click()
    await expect(window.getByRole('alert')).toContainText('packaged builds')

    await window.getByRole('button', { name: 'Remote Control', exact: true }).click()
    await expect(window.getByRole('heading', { name: 'Remote Control', exact: true })).toBeVisible()
    await window.getByLabel('Relay server').fill('ws://127.0.0.1:45679')
    await window.getByRole('button', { name: 'Save relay' }).click()
    await window.getByRole('switch', { name: 'Enable remote control' }).click()
    await expect(window.getByRole('switch', { name: 'Enable remote control' })).toHaveAttribute('aria-checked', 'true')
    await expect(window.getByText('OFFLINE', { exact: true })).toBeVisible()

    const surface = await window.evaluate(() => Object.keys((globalThis as unknown as {
      bs: { v2: Record<string, unknown> }
    }).bs.v2))
    expect(surface).toEqual(expect.arrayContaining([
      'update.status', 'update.setChannel', 'remote.status', 'remote.setEnabled',
      'remote.startPairing', 'remote.revokeDevice'
    ]))
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    rmSync(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
