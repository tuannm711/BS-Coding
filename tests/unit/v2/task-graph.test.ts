import { describe, expect, it } from 'vitest'
import { runnableTaskIds, validateGraph } from '../../../src/main/v2/domain/workflow/task-graph'

describe('task graph validation', () => {
  it('rejects duplicate ids, missing dependencies and cycles', () => {
    expect(() => validateGraph([
      { id: 'A', dependsOn: [], acceptanceCriteria: ['done'] },
      { id: 'A', dependsOn: [], acceptanceCriteria: ['done'] }
    ])).toThrow(/duplicate/i)
    expect(() => validateGraph([
      { id: 'A', dependsOn: ['missing'], acceptanceCriteria: ['done'] }
    ])).toThrow(/missing dependency/i)
    expect(() => validateGraph([
      { id: 'A', dependsOn: ['B'], acceptanceCriteria: ['done'] },
      { id: 'B', dependsOn: ['A'], acceptanceCriteria: ['done'] }
    ])).toThrow(/cycle/i)
  })

  it('requires acceptance criteria unless informational', () => {
    expect(() => validateGraph([{ id: 'A', dependsOn: [], acceptanceCriteria: [] }]))
      .toThrow(/acceptance/i)
    expect(validateGraph([{ id: 'I', dependsOn: [], acceptanceCriteria: [], informational: true }]))
      .toBe(true)
  })

  it('selects only queued tasks whose dependencies completed', () => {
    expect(runnableTaskIds([
      { id: 'A', status: 'COMPLETED', dependsOn: [] },
      { id: 'B', status: 'QUEUED', dependsOn: ['A'] },
      { id: 'C', status: 'QUEUED', dependsOn: ['B'] }
    ])).toEqual(['B'])
  })

  it('rejects unsatisfied capabilities, workspace conflicts and invalid gate scopes', () => {
    const tasks = [{ id: 'A', dependsOn: [], acceptanceCriteria: ['done'],
      requiredCapability: 'typescript', workspaceKey: 'shared', qualityGateScopes: ['missing'] }]
    expect(() => validateGraph(tasks, { eligibleCapabilities: new Set(),
      resolvableWorkspaceKeys: new Set(['shared']), validQualityGateScopes: new Set(['A']) }))
      .toThrow(/capability/i)
    expect(() => validateGraph(tasks, { eligibleCapabilities: new Set(['typescript']),
      resolvableWorkspaceKeys: new Set(), validQualityGateScopes: new Set(['A']) }))
      .toThrow(/workspace/i)
    expect(() => validateGraph(tasks, { eligibleCapabilities: new Set(['typescript']),
      resolvableWorkspaceKeys: new Set(['shared']), validQualityGateScopes: new Set(['A']) }))
      .toThrow(/quality gate/i)
  })
})
