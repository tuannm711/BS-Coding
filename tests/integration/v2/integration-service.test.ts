import { describe, expect, it } from 'vitest'
import { IntegrationService } from '../../../src/main/v2/application/workflow/integration-service'

describe('IntegrationService', () => {
  it('merges approved branches in deterministic task order', async () => {
    const merged: string[] = []
    const service = new IntegrationService({ merge: async branch => {
      merged.push(branch); return { kind: 'MERGED' as const, commit: `commit-${branch}` }
    }, createConflictTask: async () => {} })
    const outcome = await service.integrate([
      { taskId: 'B', branch: 'branch-b', approved: true },
      { taskId: 'A', branch: 'branch-a', approved: true },
      { taskId: 'C', branch: 'branch-c', approved: false }
    ])
    expect(merged).toEqual(['branch-a', 'branch-b'])
    expect(outcome).toEqual({ kind: 'MERGED', commit: 'commit-branch-b' })
  })

  it('turns merge conflicts into explicit audited conflict tasks', async () => {
    const conflicts: unknown[] = []
    const service = new IntegrationService({ merge: async () => ({
      kind: 'CONFLICT' as const, files: ['src/auth.ts']
    }), createConflictTask: async conflict => { conflicts.push(conflict) } })
    const outcome = await service.integrate([{ taskId: 'A', branch: 'branch-a', approved: true }])
    expect(outcome).toEqual({ kind: 'CONFLICT', files: ['src/auth.ts'] })
    expect(conflicts).toEqual([{ taskId: 'A', branch: 'branch-a', files: ['src/auth.ts'] }])
  })
})
