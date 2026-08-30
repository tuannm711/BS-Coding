import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { seedV2Backend } from '../fixtures/v2-seed'

test('V2 core flow exposes Work tabs and a supporting bottom panel', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-core-'))
  const projectPath = mkdtempSync(path.join(tmpdir(), 'bs-v2-core-project-'))
  seedV2Backend(userData, projectPath)
  const app = await electron.launch({ args: ['.'], env: {
    ...process.env as Record<string, string>, BS_USER_DATA: userData, BS_V2: '1'
  } })
  try {
    const window = await app.firstWindow()
    await window.getByRole('button', { name: /P15 backend/ }).click()
    await expect(window.getByRole('navigation', { name: 'Work Session sections' })
      .getByRole('button')).toHaveCount(6)
    const panel = window.getByTestId('v2-bottom-panel')
    await expect(panel).toHaveAttribute('data-expanded', 'false')
    await panel.getByRole('button', { name: 'Tests', exact: true }).click()
    await expect(panel).toHaveAttribute('data-expanded', 'true')
    await expect(panel.getByText('No test runs recorded.')).toBeVisible()
    await panel.getByRole('button', { name: 'Problems', exact: true }).click()
    await expect(panel.getByText('No problems reported.')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    rmSync(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
