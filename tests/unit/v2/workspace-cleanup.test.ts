import { describe, expect, it } from 'vitest'
import { createWorkspaceCleanupService, mayDeleteWorkspace } from '../../../src/main/v2/application/workflow/workspace-cleanup'

describe('workspace cleanup policy', () => {
  it('requires merged or archived state, recorded audit, and no active references', () => {
    expect(mayDeleteWorkspace({ merged: false, archived: false, auditRecorded: true,
      activeReferences: 0 })).toBe(false)
    expect(mayDeleteWorkspace({ merged: true, archived: false, auditRecorded: false,
      activeReferences: 0 })).toBe(false)
    expect(mayDeleteWorkspace({ merged: true, archived: false, auditRecorded: true,
      activeReferences: 1 })).toBe(false)
    expect(mayDeleteWorkspace({ merged: true, archived: false, auditRecorded: true,
      activeReferences: 0 })).toBe(true)
  })

  it('returns cleanup failures as warnings and never force-deletes', async () => {
    const calls: unknown[] = []
    const service = createWorkspaceCleanupService({ remove: async (id, options) => {
      calls.push({ id, options }); throw new Error('locked')
    } })
    await expect(service.cleanup('w', { merged: true, archived: false, auditRecorded: true,
      activeReferences: 0 })).resolves.toEqual({ kind: 'WARNING', message: 'locked' })
    expect(calls).toEqual([{ id: 'w', options: { force: false } }])
  })
})
