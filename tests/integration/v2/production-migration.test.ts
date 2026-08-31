import { afterEach, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { runProductionV1Migration } from '../../../src/main/v2/infrastructure/migration/production-migration'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it('backs up V1 sources, imports once and reuses a validated cutover marker', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v2-cutover-'))
  roots.push(root)
  const userData = path.join(root, 'userData')
  const connections = path.join(userData, 'connections')
  mkdirSync(connections, { recursive: true })
  writeFileSync(path.join(userData, 'workspaces.json'), JSON.stringify([{
    projectPath: 'C:/PMS', name: 'PMS', agents: [{ id: 'agent-1', name: 'Worker',
      templateId: 'bs', cwd: 'C:/PMS', kind: 'native', mode: 'build' }]
  }]))
  writeFileSync(path.join(userData, 'sessions.json'), JSON.stringify([{
    schemaVersion: 2, id: 'session-1', agentId: 'agent-1', projectPath: 'C:/PMS',
    title: 'Legacy work', createdAt: 1_700_000_000_000, updatedAt: 1_700_000_001_000,
    items: [{ kind: 'message', message: { id: 'm1', role: 'user', text: 'hello',
      createdAt: 1_700_000_000_000 } }],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  }]))
  writeFileSync(path.join(connections, 'accounts.json'), JSON.stringify({ version: 1,
    connections: [{ providerId: 'openai', activeAccountId: 'account-1', accounts: [{
      id: 'account-1', providerId: 'openai', label: 'Work', authMode: 'api-key',
      status: 'active', createdAt: 1_700_000_000_000, lastUsedAt: 1_700_000_001_000,
      keyRef: 'account:account-1'
    }] }] }))
  writeFileSync(path.join(connections, 'vault.json'), JSON.stringify({
    'account:account-1': 'encrypted-secret-bytes'
  }))
  const databasePath = path.join(userData, 'v2', 'state.sqlite')
  const backupRoot = path.join(userData, 'v1-backups')

  const first = await runProductionV1Migration({ userDataPath: userData, databasePath, backupRoot })
  expect(first.validated).toBe(true)
  expect(existsSync(path.join(first.backupPath, 'manifest.json'))).toBe(true)
  expect(readFileSync(path.join(first.backupPath, 'connections', 'vault.json'), 'utf8'))
    .toContain('encrypted-secret-bytes')

  const db = new Database(databasePath)
  expect(db.prepare('SELECT COUNT(*) count FROM projects').get()).toEqual({ count: 1 })
  expect(db.prepare('SELECT COUNT(*) count FROM agent_definitions').get()).toEqual({ count: 1 })
  expect(db.prepare('SELECT COUNT(*) count FROM work_sessions').get()).toEqual({ count: 1 })
  expect(JSON.stringify(db.prepare('SELECT * FROM provider_accounts').all()))
    .not.toContain('encrypted-secret-bytes')
  db.close()

  writeFileSync(path.join(connections, 'accounts.json'), JSON.stringify({ version: 1,
    connections: [] }))
  const second = await runProductionV1Migration({ userDataPath: userData, databasePath, backupRoot })
  expect(second).toMatchObject({ validated: true, sourceFingerprint: first.sourceFingerprint })
  const reopened = new Database(databasePath)
  expect(reopened.prepare('SELECT COUNT(*) count FROM projects').get()).toEqual({ count: 1 })
  reopened.prepare("UPDATE cutover_state SET report_json = ? WHERE id = 'global'")
    .run(JSON.stringify({ validated: true, rawSecret: 'forged' }))
  reopened.close()
  await expect(runProductionV1Migration({ userDataPath: userData, databasePath, backupRoot }))
    .rejects.toThrow()
})
