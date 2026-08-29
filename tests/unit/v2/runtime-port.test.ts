import { describe, expect, it } from 'vitest'
import { RUNTIME_STREAM_KINDS, type RuntimeStreamPart } from '../../../src/shared/v2/contracts/runtime'

describe('RuntimePort contracts', () => {
  it('declares the complete normalized stream vocabulary', () => {
    expect(RUNTIME_STREAM_KINDS).toEqual([
      'text-delta', 'reasoning-delta', 'tool-call', 'finish', 'error'
    ])
  })

  it('uses provider-neutral normalized stream parts', () => {
    const part: RuntimeStreamPart = { kind: 'tool-call', call: {
      callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
      origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z'
    } }
    expect(part.kind).toBe('tool-call')
    expect(part).not.toHaveProperty('providerMessage')
  })

  it('represents finish and errors structurally', () => {
    const parts: RuntimeStreamPart[] = [
      { kind: 'finish', reason: 'stop' },
      { kind: 'error', error: { code: 'RATE_LIMIT', message: 'later' } }
    ]
    expect(parts.map(part => part.kind)).toEqual(['finish', 'error'])
  })
})
