import { describe, expect, it } from 'vitest'
import { rankFallbackAgents, type FallbackCandidate } from '../../src/shared/agent-fallback'

const agent = (agentId: string, providerId: string, modelId: string, accountId: string): FallbackCandidate =>
  ({ agentId, providerId, modelId, accountId })

// The owner's real project, in declaration order.
const all = [
  agent('anti-gemini-flash', 'antigravity', 'gemini-3.6-flash-high', 'bdg'),
  agent('anti-claude-opus', 'antigravity', 'claude-opus-4-6-thinking', 'bdg'),
  agent('anti-claude-sonnet', 'antigravity', 'claude-sonnet-4-6', 'bdg'),
  agent('bs', 'openai', 'gpt-5.6-sol', '90vn'),
  agent('lcott', 'openai', 'gpt-5.6-sol', 'lcott'),
  agent('ernandez', 'openai', 'gpt-5.6-sol', 'ernandez'),
  agent('terra', 'openai', 'gpt-5.6-terra', 'bdg')
]

const rank = (fromId: string, spent: (c: FallbackCandidate) => boolean = () => false) => {
  const from = all.find(candidate => candidate.agentId === fromId)!
  return rankFallbackAgents({ from, candidates: all, isPoolSpent: spent }).map(c => c.agentId)
}

describe('rankFallbackAgents', () => {
  it('prefers the same model on another account', () => {
    expect(rank('bs').slice(0, 2)).toEqual(['lcott', 'ernandez'])
  })

  it('takes the same provider before another provider', () => {
    const order = rank('bs')
    expect(order.indexOf('terra')).toBeLessThan(order.indexOf('anti-gemini-flash'))
  })

  it('never offers the agent that was refused', () => {
    expect(rank('bs')).not.toContain('bs')
  })

  it('drops a candidate whose pool is spent', () => {
    // anti-claude-opus is a different model on the same exhausted claude-gpt
    // pool, so it is not an alternative at all. Without this it would be tried
    // and earn a 429 that was predictable.
    const spent = (c: FallbackCandidate) => c.modelId.includes('claude')
    expect(rank('anti-claude-sonnet', spent)).toEqual(['anti-gemini-flash', 'bs', 'lcott', 'ernandez', 'terra'])
  })

  it('returns nothing when there is no one else', () => {
    const only = all[3]
    expect(rankFallbackAgents({ from: only, candidates: [only], isPoolSpent: () => false })).toEqual([])
  })
})
