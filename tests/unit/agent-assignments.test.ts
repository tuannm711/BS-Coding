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
})
