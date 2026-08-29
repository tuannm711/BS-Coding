import { describe, expect, it } from 'vitest'
import { createCompactionPlan } from '../../../src/main/v2/runtime/context/compaction-policy'

const events = [
  { id: 'e1', type: 'USER_MESSAGE' },
  { id: 'e2', type: 'ASSISTANT_MESSAGE' }
]

describe('compaction policy', () => {
  it('creates a canonical summary reference without rewriting source history', () => {
    const original = structuredClone(events)
    const plan = createCompactionPlan({ currentTokens: 900, maxInputTokens: 1000,
      threshold: 0.8, events, summaryArtifactId: 'summary-1' })
    expect(plan).toEqual({ kind: 'COMPACT', artifact: { id: 'summary-1',
      sourceEventIds: ['e1', 'e2'] }, event: { type: 'SUMMARY_CREATED', artifactId: 'summary-1' } })
    expect(events).toEqual(original)
    expect(plan).not.toHaveProperty('providerConversationId')
  })

  it('does nothing below threshold', () => {
    expect(createCompactionPlan({ currentTokens: 100, maxInputTokens: 1000,
      threshold: 0.8, events, summaryArtifactId: 'summary-1' })).toEqual({ kind: 'NONE' })
  })
})
