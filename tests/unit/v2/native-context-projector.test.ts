import { describe, expect, it } from 'vitest'
import { projectContext } from '../../../src/main/v2/runtime/providers/native-context-projector'

const packet = {
  system: ['security'], goal: 'OAuth', history: [{
    id: 'e1', type: 'TOOL_CALL' as const, schemaVersion: 1 as const, sequence: 1,
    timestamp: '2026-08-29T00:00:00.000Z', projectId: 'p', correlationId: 'corr',
    payload: { callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
      origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z' }
  }], artifacts: [], toolSchemas: [], maxInputTokens: 1000
}

describe('native context projection', () => {
  it('preserves structured tool history when supported', () => {
    expect(projectContext(packet, { structuredToolHistory: true })).toEqual([
      { role: 'system', content: 'security' },
      { role: 'user', content: 'Goal: OAuth' },
      { role: 'tool-call', callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' } }
    ])
  })

  it('uses neutral factual user history when structured history is unsupported', () => {
    const projected = projectContext(packet, { structuredToolHistory: false })
    expect(projected.some(message => message.role === 'assistant' && /read\(/.test(String(message.content)))).toBe(false)
    expect(projected.at(-1)).toEqual({
      role: 'user', content: 'Past execution record: tool read was requested (call c1).'
    })
  })
})
