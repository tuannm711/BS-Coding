import { describe, expect, it } from 'vitest'
import { mergeProviderAccounts } from '../../src/renderer/src/components/settings/AgentsTab'

describe('agent provider account model merge', () => {
  it('adds active Antigravity account models as an independent provider', () => {
    const providers = mergeProviderAccounts([], [{ providerId: 'antigravity', activeAccountId: 'a1', accounts: [{ id: 'a1', providerId: 'antigravity', label: 'a@example.com', authMode: 'oauth', status: 'active', models: ['gemini-2.5-pro'], createdAt: 1, lastUsedAt: 1 }] }])
    expect(providers).toEqual([{ id: 'antigravity', apiKey: '', models: ['gemini-2.5-pro'] }])
  })
})
