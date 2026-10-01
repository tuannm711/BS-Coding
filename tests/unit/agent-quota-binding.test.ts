import { describe, expect, it } from 'vitest'
import { agentQuotaConflicts, quotaPoolsForAccount, quotaPoolForModel, modelsForAgentQuota } from '../../src/shared/agent-quota-binding'

const anti = {
  id: 'anti-a', providerId: 'antigravity',
  models: ['gemini-3-flash', 'claude-sonnet-4-6', 'gpt-oss-120b-medium']
}

describe('agent quota binding', () => {
  it('allows Claude and GPT to switch within one pool and excludes Gemini', () => {
    expect(quotaPoolsForAccount(anti).map(pool => [pool.id, pool.modelIds])).toEqual([
      ['gemini', ['gemini-3-flash']],
      ['claude-gpt', ['claude-sonnet-4-6', 'gpt-oss-120b-medium']]
    ])
    expect(modelsForAgentQuota({ provider: 'antigravity', accountId: 'anti-a', quotaPoolId: 'claude-gpt' }, [anti])).toEqual(['claude-sonnet-4-6', 'gpt-oss-120b-medium'])
    expect(quotaPoolForModel(anti, 'unknown')).toBeUndefined()
  })

  it('treats multiple time windows as one account quota', () => {
    const account = { id: 'oa', providerId: 'openai', models: ['gpt-a', 'gpt-b'] }
    expect(quotaPoolsForAccount(account).map(pool => pool.modelIds)).toEqual([['gpt-a', 'gpt-b']])
    expect(agentQuotaConflicts([
      { name: 'one', provider: 'openai', accountId: 'oa', model: 'gpt-a' },
      { name: 'two', provider: 'openai', accountId: 'oa', model: 'gpt-b' }
    ], [account])).toEqual([{ key: 'openai/oa/account', agentNames: ['one', 'two'] }])
  })

  it('detects conflicts by account and pool, including legacy profiles without a pool ID', () => {
    const agents = [
      { name: 'claude', provider: 'antigravity', accountId: 'anti-a', model: 'claude-sonnet-4-6' },
      { name: 'gpt', provider: 'antigravity', accountId: 'anti-a', quotaPoolId: 'claude-gpt' },
      { name: 'gemini', provider: 'antigravity', accountId: 'anti-a', quotaPoolId: 'gemini' },
      { name: 'other-account', provider: 'antigravity', accountId: 'anti-b', quotaPoolId: 'claude-gpt' }
    ]
    expect(agentQuotaConflicts(agents, [anti, { ...anti, id: 'anti-b' }])).toEqual([
      { key: 'antigravity/anti-a/claude-gpt', agentNames: ['claude', 'gpt'] }
    ])
  })

  it('never widens a saved pool when the selected model or pool is unavailable', () => {
    expect(modelsForAgentQuota({ provider: 'antigravity', accountId: 'anti-a', quotaPoolId: 'missing' }, [anti])).toEqual([])
    expect(modelsForAgentQuota({ provider: 'antigravity', accountId: 'anti-a', model: 'unknown' }, [anti])).toEqual([])
  })
})
