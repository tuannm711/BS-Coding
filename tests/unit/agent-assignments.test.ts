import { describe, expect, it } from 'vitest'
import { AssignmentStore } from '../../src/main/agent/assignments'

describe('assignment store', () => {
  it('persists exact model/account/speed and increments revision', () => {
    const data: Record<string, unknown> = {}
    const store = new AssignmentStore({ load: () => data.value, save: value => { data.value = value } })
    const first = store.set({ agentId: 'a1', providerId: 'antigravity', accountId: 'acct-1', modelId: 'gemini-3.1-pro-low', speed: 'fast', revision: 0 })
    const second = store.load()['a1']
    expect(first).toMatchObject({ modelId: 'gemini-3.1-pro-low', speed: 'fast', revision: 1 })
    expect(second).toEqual(first)
  })

  it('migrates legacy settings/workspace agents and marks incomplete assignments for review', () => {
    const data: Record<string, unknown> = {}
    const store = new AssignmentStore({ load: () => data.value, save: value => { data.value = value } })
    const result = store.migrate({ agents: { reviewer: { provider: 'openai', model: 'gpt-5.6-sol', accountId: 'a1', speed: 'fast' } } }, [
      { id: 'r1', name: 'reviewer' },
      { id: 'r2', name: 'missing' }
    ])
    expect(result).toEqual({ migrated: 2, needsReview: ['r2'] })
    expect(store.get('r1')).toMatchObject({ providerId: 'openai', modelId: 'gpt-5.6-sol', accountId: 'a1', speed: 'fast', status: 'ready' })
    expect(store.get('r2')).toMatchObject({ status: 'needs-review' })
  })
})
