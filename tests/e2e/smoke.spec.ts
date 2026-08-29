import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('app launches with the V2 IPC bootstrap and keeps the V1 shell available', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-launch-'))
  try {
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData, BS_V2: '1' }
    })
    const window = await app.firstWindow()
    await expect(window).toHaveTitle(/BS Coding/)
    await expect(window.locator('.sidebar')).toBeVisible()
    // Version loads asynchronously via IPC; auto-wait for it to appear.
    const version = window.locator('.status-bar .sb-mono').last()
    await expect(version).toHaveText(/^v\d+\.\d+\.\d+$/)
    expect(await version.textContent()).not.toBe('v0.1.0')
    await app.close()
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('native bs agent renders a chat panel and sends a message', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  try {
    const workspaces = [{
      projectPath: project,
      name: 'E2E Project',
      agents: [
        { id: 'e2e-bs', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }
      ]
    }]
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify(workspaces, null, 2))

    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await expect(window.locator('.project-row')).toBeVisible()
      await window.locator('.project-row').click()
      await expect(window.locator('.chat-panel')).toBeVisible()

      await window.getByRole('button', { name: 'menu E2E Project' }).click()
      await expect(window.getByRole('button', { name: 'Open in VS Code' })).toBeVisible()
      await expect(window.getByRole('button', { name: 'Remove' })).toBeVisible()
      await window.keyboard.press('Escape')

      await window.locator('.chat-input-field').fill('hello bs')
      await window.locator('.chat-input-field').press('Enter')
      await expect(window.locator('.chat-msg.user').last()).toContainText('hello bs')

      await window.getByRole('button', { name: 'plan' }).click()
      await expect(window.locator('.chat-mode-hint')).toBeVisible()
      await window.getByRole('button', { name: 'build' }).click()
      await expect(window.locator('.chat-mode-hint')).toHaveCount(0)

      await window.locator('.chat-input-field').focus()
      await window.keyboard.press('Tab')
      await expect(window.locator('.chat-mode-hint')).toBeVisible()
      await window.keyboard.press('Tab')
      await expect(window.locator('.chat-mode-hint')).toHaveCount(0)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('pasted/attached image previews render in input, feed, and lightbox', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  // 1x1 transparent PNG (valid image data so naturalWidth reflects a decode)
  const pngPath = path.join(project, 'pixel.png')
  writeFileSync(pngPath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  ))
  try {
    const workspaces = [{
      projectPath: project,
      name: 'E2E Project',
      agents: [
        { id: 'e2e-bs', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }
      ]
    }]
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify(workspaces, null, 2))

    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await expect(window.locator('.project-row')).toBeVisible()
      await window.locator('.project-row').click()
      await expect(window.locator('.chat-panel')).toBeVisible()

      const field = window.locator('.chat-input-field')
      await field.click()

      // Ctrl+V path: dispatch a real paste event carrying an image file.
      await field.evaluate((el) => {
        const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const dt = new DataTransfer()
        dt.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }))
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })

      // The input chip thumbnail must actually decode the data: URL (CSP-blocked
      // images keep naturalWidth === 0 and never render).
      const chipThumb = window.locator('.chat-image-chip img.chat-image-thumb')
      await expect(chipThumb).toBeVisible()
      await expect.poll(() => chipThumb.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

      // Attach path: hidden file input triggers the same addImageFiles flow.
      await window.locator('.chat-input input[type="file"]').setInputFiles(pngPath)
      await expect(window.locator('.chat-image-chip img.chat-image-thumb')).toHaveCount(2)
      await expect.poll(() => window.locator('.chat-image-chip img.chat-image-thumb').last()
        .evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

      await field.fill('check the image')
      await field.press('Enter')

      // After sending, the user message shows the image thumbnails in the feed.
      const feedThumb = window.locator('.chat-msg.user img.chat-thumb')
      await expect(feedThumb).toHaveCount(2)
      await expect.poll(() => feedThumb.first()
        .evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

      // Lightbox preview also renders the data: URL.
      await feedThumb.first().click()
      const lightboxImg = window.locator('.chat-lightbox img')
      await expect(lightboxImg).toBeVisible()
      await expect.poll(() => lightboxImg.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('settings screen connects a provider account through the capability modal', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  try {
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([]))
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await window.getByRole('button', { name: 'Menu', exact: true }).click()
      await window.getByRole('button', { name: 'Settings' }).click()
      await expect(window.locator('.settings-dialog')).toBeVisible()
      await expect(window.locator('.settings-nav-item', { hasText: 'Providers' })).toBeVisible()

      await window.getByRole('button', { name: /Add provider/ }).click()
      let popup = window.locator('.dialog:not(.settings-dialog)')
      await expect(popup).toBeVisible()

      await expect(popup.getByRole('button', { name: 'Create authorization link' })).toBeVisible()
      await popup.getByRole('button', { name: 'Create authorization link' }).click()
      await expect(popup.getByLabel('Authorization link')).toBeVisible()
      await expect(popup.getByRole('button', { name: 'Copy link' })).toBeVisible()
      await expect(popup.getByRole('button', { name: 'Open browser' })).toBeVisible()
      await expect(popup.locator('.authorization-countdown')).toBeVisible()
      await popup.getByRole('button', { name: 'Cancel' }).click()
      await expect(popup).toHaveCount(0)

      await window.getByRole('button', { name: /Add provider/ }).click()
      popup = window.locator('.dialog:not(.settings-dialog)')
      await popup.getByRole('button', { name: 'Create authorization link' }).click()
      await expect(popup.getByLabel('Authorization link')).toBeVisible()
      await popup.getByRole('button', { name: 'Cancel' }).click()
      await expect(popup).toHaveCount(0)

      await window.getByRole('button', { name: /Add provider/ }).click()
      popup = window.locator('.dialog:not(.settings-dialog)')
      await popup.locator('#provider-method').selectOption('api-key')
      await expect(popup.getByRole('button', { name: 'Create authorization link' })).toHaveCount(0)
      await expect(popup.getByRole('button', { name: 'Open browser' })).toHaveCount(0)
      await popup.locator('input[placeholder="apiKey"]').fill('sk-test')
      await popup.locator('.submit').click()

      await expect(window.locator('.provider-connected')).toContainText('OpenAI')
      await expect(window.locator('.provider-connected')).toContainText('Deactivate')
      await expect(window.locator('.provider-connected')).toContainText('gpt-5.6-sol')
      const providerCard = window.locator('.quota-account-card.provider').first()
      await expect(providerCard).toBeInViewport()
      await expect(providerCard.getByRole('button', { name: 'Refresh' })).toBeVisible()
      await expect(providerCard.getByRole('button', { name: 'Reconnect' })).toBeVisible()
      await expect(providerCard.getByRole('button', { name: 'Deactivate' })).toBeVisible()
      await expect(providerCard.getByRole('button', { name: 'Remove' })).toBeVisible()
      expect(await providerCard.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await expect(providerCard.locator('.quota-model-list')).toHaveCount(0)
      await providerCard.getByRole('button', { name: /View/ }).click()
      await expect(providerCard.locator('.quota-model-list')).toBeVisible()
      await window.getByRole('button', { name: 'Cancel' }).click()
      await expect(window.locator('.settings-dialog')).toHaveCount(0)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('settings agent list immediately reconciles the active workspace', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  try {
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
      projectPath: project,
      name: 'Agent Sync Project',
      agents: [{ id: 'sync-bs', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }]
    }], null, 2))
    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await window.locator('.project-row').click()
      await expect(window.locator('.pane-title', { hasText: 'bs' })).toBeVisible()
      await window.getByRole('button', { name: 'Menu', exact: true }).click()
      await window.getByRole('button', { name: 'Settings' }).click()
      const settings = window.locator('.settings-dialog')
      await settings.locator('.settings-nav-item', { hasText: 'Agents' }).click()

      await settings.getByRole('button', { name: '+ Add agent' }).click()
      const addDialog = window.locator('.dialog:not(.settings-dialog)')
      await addDialog.locator('#agent-name').fill('reviewer')
      await addDialog.getByRole('button', { name: 'Add' }).click()
      const createdRow = settings.locator('.agent-table-row').filter({ hasText: 'reviewer' })
      await createdRow.getByRole('button', { name: 'Edit system prompt for reviewer' }).click()
      const promptDialog = window.locator('.dialog:not(.settings-dialog)')
      await promptDialog.getByLabel('System prompt').fill('Review changes carefully and report concrete defects.')
      await promptDialog.getByRole('button', { name: 'Save prompt' }).click()
      const tableFits = await settings.locator('.agent-table-wrap').evaluate(element => element.scrollWidth <= element.clientWidth)
      expect(tableFits).toBe(true)
      await settings.getByRole('button', { name: 'Save' }).click()
      await expect(settings.locator('.settings-status')).toHaveText('Settings saved.')
      const savedWithReviewer = JSON.parse(readFileSync(path.join(userData, 'bs.json'), 'utf8'))
      expect(savedWithReviewer.agents.reviewer?.systemPrompt)
        .toBe('Review changes carefully and report concrete defects.')

      await expect(window.locator('.chat-panel')).toHaveCount(1)
      await expect(window.locator('.pane-title', { hasText: 'reviewer' })).toHaveCount(0)
      await settings.getByRole('button', { name: 'Close' }).click()
      await expect(settings).toHaveCount(0)
      await window.locator('.agent-picker-trigger').click()
      const agentMenu = window.locator('.agent-picker-menu-portal')
      await expect(agentMenu.locator('.agent-picker-item', { hasText: 'reviewer' })).toBeVisible()
      expect(await agentMenu.evaluate(element => {
        const rect = element.getBoundingClientRect()
        // globalThis, not window: in this file `window` is the Electron Page,
        // and inside evaluate the runtime value is the browser's own global.
        return rect.left >= 0 && rect.top >= 0 && rect.right <= globalThis.innerWidth && rect.bottom <= globalThis.innerHeight
      })).toBe(true)
      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('Enter')
      await expect(window.locator('.pane-title')).toHaveText('reviewer')
      await expect(window.locator('.chat-panel')).toHaveCount(1)
      await expect(window.locator('.agent-picker-trigger')).toBeFocused()
      await window.locator('.agent-picker-trigger').click()
      await window.keyboard.press('Escape')
      await expect(agentMenu).toHaveCount(0)
      await expect(window.locator('.agent-picker-trigger')).toBeFocused()

      await window.getByRole('button', { name: 'Menu', exact: true }).click()
      await window.getByRole('button', { name: 'Settings' }).click()
      const reopenedSettings = window.locator('.settings-dialog')
      await reopenedSettings.locator('.settings-nav-item', { hasText: 'Agents' }).click()
      const reviewerRow = reopenedSettings.locator('.agent-table-row').filter({ hasText: 'reviewer' })
      await reviewerRow.getByRole('button', { name: 'Delete reviewer' }).click()
      await reopenedSettings.getByRole('button', { name: 'Save' }).click()
      await expect(reopenedSettings.locator('.settings-status')).toHaveText('Settings saved.')

      await expect(window.locator('.pane-title', { hasText: 'reviewer' })).toHaveCount(0)
      await expect(window.locator('.pane.active .pane-title')).toHaveText('bs')
      await expect(window.locator('.chat-panel')).toHaveCount(1)
      await window.reload()
      await window.locator('.project-row').click()
      await expect(window.locator('.chat-panel')).toHaveCount(1)
      await expect(window.locator('.agent-picker-trigger')).toContainText('bs')
      const stored = JSON.parse(readFileSync(path.join(userData, 'workspaces.json'), 'utf8'))
      expect(stored[0].agents.map((agent: { name: string }) => agent.name)).toEqual(['bs'])
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('opening a legacy workspace removes duplicate native Agent rows', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-duplicate-agent-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-duplicate-project-'))
  try {
    writeFileSync(path.join(userData, 'bs.json'), JSON.stringify({
      provider: {}, model: '', agents: {
        bs: { systemPrompt: 'Default' },
        reviewer: { systemPrompt: 'Review' }
      }
    }))
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
      projectPath: project,
      name: 'Duplicate Agent Project',
      agents: [
        { id: 'duplicate-bs', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' },
        { id: 'reviewer-first', name: 'reviewer', templateId: 'bs', cwd: project, kind: 'native' },
        { id: 'reviewer-duplicate', name: 'reviewer', templateId: 'bs', cwd: project, kind: 'native' }
      ]
    }]))
    const app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
    const window = await app.firstWindow()
    try {
      await window.locator('.project-row').click()
      await window.locator('.agent-picker-trigger').click()
      await expect(window.locator('.agent-picker-item').filter({ hasText: 'reviewer' })).toHaveCount(1)
      const stored = JSON.parse(readFileSync(path.join(userData, 'workspaces.json'), 'utf8'))
      expect(stored[0].agents.filter((agent: { name: string }) => agent.name === 'reviewer')).toHaveLength(1)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
