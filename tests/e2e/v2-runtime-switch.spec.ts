import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedV2Backend } from '../fixtures/v2-seed'

test('V2 runtime switch and review rework stay in one Work Session', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-runtime-ui-'))
  const projectPath = mkdtempSync(path.join(tmpdir(), 'bs-v2-runtime-project-'))
  seedV2Backend(userData, projectPath)
  const app = await electron.launch({ args: ['.'], env: {
    ...process.env as Record<string, string>, BS_USER_DATA: userData, BS_V2: '1'
  } })
  try {
    const window = await app.firstWindow()
    await window.getByRole('button', { name: /P15 backend/ }).click()
    await window.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(window.getByRole('dialog', { name: 'Cancel Work Session?' })).toBeVisible()
    await window.getByRole('button', { name: 'Keep Working' }).click()
    await expect(window.getByText('EXECUTING', { exact: true })).toBeVisible()
    await window.getByLabel('Runtime target').selectOption('openai/account-ui/model-ui')
    await window.getByRole('button', { name: 'Switch runtime' }).click()
    await window.getByRole('button', { name: 'History' }).click()
    const history = window.getByRole('complementary', { name: 'Runtime History' })
    await expect(history.getByText('model-ui', { exact: true })).toBeVisible()
    await history.getByRole('button', { name: 'Close runtime history' }).click()
    await window.getByRole('button', { name: 'Review', exact: true }).click()
    await window.getByRole('button', { name: 'Create rework task' }).click()
    await expect(window.getByText(/Rework task:/)).toBeVisible()
    await expect(window.getByRole('heading', { name: 'P15 backend' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    rmSync(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
