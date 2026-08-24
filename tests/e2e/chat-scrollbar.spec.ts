import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('chat feed scrollbar reflects the full transcript (no content-visibility collapse)', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-scroll-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-scroll-project-'))
  try {
    const agentId = 'e2e-bs'
    const workspaces = [{
      projectPath: project,
      name: 'Scroll Test',
      agents: [
        { id: agentId, name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }
      ]
    }]
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify(workspaces, null, 2))

    const now = Date.now()
    const items: Array<{ kind: string; message: { id: string; role: string; text: string; createdAt: number } }> = []
    for (let i = 0; i < 60; i++) {
      items.push({ kind: 'message', message: { id: `u-${i}`, role: 'user', text: `user question ${i}`, createdAt: now + i } })
      items.push({
        kind: 'message',
        message: {
          id: `a-${i}`,
          role: 'assistant',
          text: `assistant answer ${i}\n` + 'detail line\n'.repeat(30 + (i % 4) * 10),
          createdAt: now + i + 1
        }
      })
    }
    const sessions = [{
      id: 'sess-1',
      agentId,
      projectPath: project,
      title: 'Long transcript',
      items,
      todos: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      createdAt: now,
      updatedAt: now
    }]
    writeFileSync(path.join(userData, 'sessions.json'), JSON.stringify(sessions, null, 2))

    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await expect(window.locator('.project-row')).toBeVisible()
      await window.locator('.project-row').click()
      await expect(window.locator('.chat-panel')).toBeVisible()

      const feed = window.locator('.chat-feed')
      await expect(feed.locator('.chat-msg')).toHaveCount(120)

      // Regression: the scrollbar must represent the whole transcript. A
      // content-visibility row inside a flex-column feed used to reserve zero
      // height when skipped, collapsing scrollHeight to a couple of viewports.
      await expect.poll(() => feed.evaluate(el => el.scrollHeight / el.clientHeight), {
        timeout: 5000
      }).toBeGreaterThan(8)

      // Opening the project must land the feed at the real bottom, even though
      // content-visibility rows settle their true heights a few frames late.
      await expect.poll(() => feed.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight), {
        timeout: 5000
      }).toBeLessThan(4)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})

test('a newly submitted turn is anchored near the top of the chat feed', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-scroll-anchor-'))
  const project = mkdtempSync(path.join(tmpdir(), 'bs-scroll-anchor-project-'))
  try {
    const agentId = 'e2e-bs'
    writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
      projectPath: project,
      name: 'Anchor Test',
      agents: [{ id: agentId, name: 'bs', templateId: 'bs', cwd: project, kind: 'native' }]
    }], null, 2))

    const now = Date.now()
    const items: Array<{ kind: string; message: { id: string; role: string; text: string; createdAt: number } }> = []
    for (let i = 0; i < 30; i++) {
      items.push({ kind: 'message', message: { id: `u-${i}`, role: 'user', text: `question ${i}`, createdAt: now + i } })
      items.push({
        kind: 'message',
        message: {
          id: `a-${i}`,
          role: 'assistant',
          text: `answer ${i}\n` + 'detail line\n'.repeat(16),
          createdAt: now + i + 1
        }
      })
    }
    writeFileSync(path.join(userData, 'sessions.json'), JSON.stringify([{
      id: 'sess-anchor',
      agentId,
      projectPath: project,
      title: 'Anchor transcript',
      items,
      todos: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
      createdAt: now,
      updatedAt: now
    }], null, 2))

    const app = await electron.launch({
      args: ['.'],
      env: { ...process.env as Record<string, string>, BS_USER_DATA: userData }
    })
    const window = await app.firstWindow()
    try {
      await window.locator('.project-row').click()
      const feed = window.locator('.chat-feed')
      await expect(feed.locator('.chat-msg')).toHaveCount(60)
      await feed.evaluate(el => { el.scrollTop = 300 })

      await window.emulateMedia({ reducedMotion: 'reduce' })
      await window.locator('.chat-input-field').fill('anchor this turn')
      await window.locator('.chat-input-field').press('Enter')

      const topOffset = () => window.locator('.chat-msg.user').last().evaluate(row => {
        const feedElement = row.closest('.chat-feed')!
        return row.getBoundingClientRect().top - feedElement.getBoundingClientRect().top
      })
      await expect.poll(topOffset).toBeGreaterThanOrEqual(18)
      await expect.poll(topOffset).toBeLessThanOrEqual(22)

      const followingStart = await feed.evaluate(el => el.scrollTop)
      await window.evaluate(() => {
        const boundary = document.querySelector('.chat-latest-boundary')!
        const block = document.createElement('div')
        block.className = 'e2e-stream-growth'
        block.style.height = '900px'
        boundary.parentElement!.insertBefore(block, boundary)
      })
      await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBeGreaterThan(followingStart + 300)

      await feed.hover()
      const followedTop = await feed.evaluate(el => el.scrollTop)
      await window.mouse.wheel(0, -500)
      await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBeLessThan(followedTop - 100)
      const manualTop = await feed.evaluate(el => el.scrollTop)

      await window.evaluate(() => {
        const block = document.querySelector('.e2e-stream-growth') as HTMLElement
        block.style.height = '1400px'
      })
      await expect.poll(async () => Math.abs(await feed.evaluate(el => el.scrollTop) - manualTop)).toBeLessThanOrEqual(1)
      await expect(window.getByRole('button', { name: 'Scroll to end' })).toBeVisible()

      await window.getByRole('button', { name: 'Scroll to end' }).click()
      await expect(window.getByRole('button', { name: 'Scroll to end' })).toBeHidden()
      const resumedTop = await feed.evaluate(el => el.scrollTop)
      await window.evaluate(() => {
        const block = document.querySelector('.e2e-stream-growth') as HTMLElement
        block.style.height = '1800px'
      })
      await expect.poll(() => feed.evaluate(el => el.scrollTop)).toBeGreaterThan(resumedTop + 300)
    } finally {
      await app.close()
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
    rmSync(project, { recursive: true, force: true })
  }
})
