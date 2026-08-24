import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { AssignmentStore, assignmentMigrationBackupPath, fileAssignmentPersistence } from '../../src/main/agent/assignments'

describe('assignment migration and reopen', () => {
  it('backs up legacy settings and restores the exact assignment after restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-assignment-reopen-'))
    const settingsFile = path.join(dir, 'bs.json')
    const assignmentFile = path.join(dir, 'assignments.json')
    const settings = { agents: { reviewer: { provider: 'antigravity', accountId: 'account-pro', model: 'gemini-3.1-pro-low', speed: 'fast' as const } } }
    writeFileSync(settingsFile, JSON.stringify(settings, null, 2))

    const firstProcess = new AssignmentStore(fileAssignmentPersistence(assignmentFile, settingsFile))
    firstProcess.migrate(settings, [{ id: 'agent-1', name: 'reviewer' }])

    const backup = assignmentMigrationBackupPath(assignmentFile)
    expect(existsSync(backup)).toBe(true)
    expect(JSON.parse(readFileSync(backup, 'utf-8'))).toEqual(settings)
    expect(JSON.parse(readFileSync(assignmentFile, 'utf-8')).version).toBe(1)

    const restartedProcess = new AssignmentStore(fileAssignmentPersistence(assignmentFile, settingsFile))
    expect(restartedProcess.get('agent-1')).toMatchObject({
      providerId: 'antigravity', accountId: 'account-pro', modelId: 'gemini-3.1-pro-low', speed: 'fast', status: 'ready'
    })
  })

  it('keeps an invalid migrated reference visible as needs-review after restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bs-assignment-review-'))
    const assignmentFile = path.join(dir, 'assignments.json')
    const firstProcess = new AssignmentStore(fileAssignmentPersistence(assignmentFile))
    firstProcess.migrate({ agents: {} }, [{ id: 'agent-2', name: 'missing', model: 'removed-model' }])

    expect(new AssignmentStore(fileAssignmentPersistence(assignmentFile)).get('agent-2')).toMatchObject({
      modelId: 'removed-model', status: 'needs-review'
    })
  })
})
