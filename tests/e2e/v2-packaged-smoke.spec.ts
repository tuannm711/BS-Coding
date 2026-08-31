import { test, expect, _electron as electron } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'

const executablePath = process.env.BS_PACKAGED_EXE
test.skip(!executablePath || !existsSync(executablePath),
  'Set BS_PACKAGED_EXE to an unpacked/package executable for release smoke')

test('packaged 2.0.0 starts V2, migrates and exits cleanly', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'bs-v2-packaged-'))
  try {
    const hashes = new Map<string, string>()
    const realSource = process.env.BS_REAL_V1_SOURCE
    for (const relative of ['workspaces.json', 'sessions.json', 'connections/accounts.json',
      'connections/vault.json']) {
      const source = realSource ? path.join(realSource, relative) : ''
      if (!source || !existsSync(source)) continue
      const destination = path.join(userData, relative)
      mkdirSync(path.dirname(destination), { recursive: true })
      copyFileSync(source, destination)
      hashes.set(relative, createHash('sha256').update(readFileSync(destination)).digest('hex'))
    }
    const app = await electron.launch({ executablePath, args: [], env: {
      ...process.env as Record<string, string>, BS_USER_DATA: userData
    } })
    const pid = app.process().pid
    if (pid === undefined) throw new Error('packaged Electron process has no pid')
    try {
      const window = await app.firstWindow()
      await expect(window).toHaveTitle(/BS Coding/)
      await expect(window.getByTestId('v2-app-shell')).toBeVisible()
      expect(await window.evaluate(() => 'api' in globalThis)).toBe(false)
    } finally {
      await app.close()
    }
    expect(() => process.kill(pid, 0)).toThrow()
    const db = new Database(path.join(userData, 'v2', 'state.sqlite'), { readonly: true })
    expect(db.prepare("SELECT COUNT(*) count FROM cutover_state WHERE id = 'global'").get())
      .toEqual({ count: 1 })
    const report = JSON.parse((db.prepare("SELECT report_json FROM cutover_state WHERE id = 'global'")
      .get() as { report_json: string }).report_json) as { validated: boolean; validationErrors: string[] }
    expect(report).toMatchObject({ validated: true, validationErrors: [] })
    db.close()
    const backupName = readdirSync(path.join(userData, 'v1-backups'))
      .find(entry => entry.startsWith('v1-backup-'))
    expect(backupName).toBeTruthy()
    const backupPath = path.join(userData, 'v1-backups', backupName!)
    const manifest = JSON.parse(readFileSync(path.join(backupPath, 'manifest.json'), 'utf8')) as {
      files: Array<{ path: string; sha256: string }>
    }
    for (const [relative, before] of hashes) {
      const entry = manifest.files.find(file => file.path === relative)
      expect(entry?.sha256).toBe(before)
      expect(createHash('sha256').update(readFileSync(path.join(backupPath, relative))).digest('hex'))
        .toBe(before)
      expect(createHash('sha256').update(readFileSync(path.join(userData, relative))).digest('hex'))
        .toBe(before)
    }
  } finally {
    rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
})
