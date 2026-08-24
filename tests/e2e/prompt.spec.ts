import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

async function launchPrompt() {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
    projectPath: project,
    name: 'E2E',
    agents: [{ id: 'a1', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }]
  }]))
  const app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
  const window = await app.firstWindow()
  await window.locator('.project-row').click()
  await expect(window.locator('.chat-panel')).toBeVisible()
  const scope = await window.locator('.chat-panel').evaluate(element => ({
    projectPath: (element as HTMLElement).dataset.projectPath!,
    sessionId: (element as HTMLElement).dataset.sessionId!
  }))
  await app.evaluate(async ({ BrowserWindow }, active) => {
    BrowserWindow.getAllWindows()[0].webContents.send('chat:event', {
      type: 'prompt-request', agentId: 'a1', promptId: 'p1', kind: 'permission',
      projectPath: active.projectPath, sessionId: active.sessionId, turnId: 'turn-prompt',
      call: { id: 'c1', tool: 'bash', input: { command: 'x' }, permission: 'pending' }
    })
  }, scope)
  await expect(window.locator('.chat-prompt')).toBeVisible()
  return { app, window }
}

test('click allow closes the prompt', async () => {
  const { app, window } = await launchPrompt()
  try {
    await window.locator('.chat-prompt-actions button.allow').click()
    await expect(window.locator('.chat-prompt')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('keyboard 1 triggers allow when panel focused', async () => {
  const { app, window } = await launchPrompt()
  try {
    await window.locator('.chat-mode').click()
    await window.keyboard.press('1')
    await expect(window.locator('.chat-prompt')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

async function launchQuestion() {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-ud-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-e2e-'))
  writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
    projectPath: project,
    name: 'E2E',
    agents: [{ id: 'a1', name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }]
  }]))
  const app = await electron.launch({ args: ['.'], env: { ...process.env as Record<string, string>, BS_USER_DATA: userData } })
  const window = await app.firstWindow()
  await window.locator('.project-row').click()
  await expect(window.locator('.chat-panel')).toBeVisible()
  const scope = await window.locator('.chat-panel').evaluate(element => ({
    projectPath: (element as HTMLElement).dataset.projectPath!,
    sessionId: (element as HTMLElement).dataset.sessionId!
  }))
  await app.evaluate(async ({ BrowserWindow }, active) => {
    BrowserWindow.getAllWindows()[0].webContents.send('chat:event', {
      type: 'prompt-request', agentId: 'a1', promptId: 'p1', kind: 'question',
      projectPath: active.projectPath, sessionId: active.sessionId, turnId: 'turn-question',
      question: 'Please enter your username:', custom: true
    })
  }, scope)
  await expect(window.locator('.chat-prompt')).toBeVisible()
  return { app, window }
}

test('text-only question submits the typed answer', async () => {
  const { app, window } = await launchQuestion()
  try {
    await window.locator('.chat-prompt-input').fill('nguyen.vana')
    await window.locator('.chat-prompt-actions button', { hasText: 'Send' }).click()
    await expect(window.locator('.chat-prompt')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('prompt spans the pane width', async () => {
  const { app, window } = await launchPrompt()
  try {
    const panel = await window.locator('.chat-panel').boundingBox()
    const prompt = await window.locator('.chat-prompt').boundingBox()
    expect(prompt).not.toBeNull()
    expect(panel).not.toBeNull()
    expect(prompt!.width).toBeGreaterThan(panel!.width * 0.95)
  } finally {
    await app.close()
  }
})
