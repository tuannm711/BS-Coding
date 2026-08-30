import { describe, expect, it } from 'vitest'
import { CanonicalEventSchema } from '../../../src/shared/v2/schemas/canonical-event'

const envelope = {
  id: 'e1', schemaVersion: 1, sequence: 1,
  timestamp: '2026-08-29T00:00:00.000Z', projectId: 'p', workSessionId: 'w',
  workflowRunId: 'r', correlationId: 'corr-1'
}

describe('CanonicalEventSchema', () => {
  it('accepts a structured tool result with call correlation', () => {
    expect(CanonicalEventSchema.parse({
      ...envelope, type: 'TOOL_RESULT', payload: {
        callId: 'call-1', status: 'success', preview: 'ok', completedAt: envelope.timestamp
      }
    })).toMatchObject({ type: 'TOOL_RESULT', payload: { callId: 'call-1' } })
  })

  it('rejects tool results without callId', () => {
    expect(CanonicalEventSchema.safeParse({
      ...envelope, type: 'TOOL_RESULT', payload: { status: 'success', completedAt: envelope.timestamp }
    }).success).toBe(false)
  })

  it('rejects invalid timestamps and missing correlation identity', () => {
    expect(CanonicalEventSchema.safeParse({
      ...envelope, timestamp: 'yesterday', correlationId: '',
      type: 'USER_MESSAGE', payload: { text: 'hello' }
    }).success).toBe(false)
  })

  it('rejects unknown event families', () => {
    expect(CanonicalEventSchema.safeParse({
      ...envelope, type: 'PROVIDER_NATIVE_OBJECT', payload: {}
    }).success).toBe(false)
  })

  it('validates strict usage payloads while allowing unknown cost', () => {
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'USAGE', payload: {
      providerId: 'openai', accountId: 'a1', requests: 1, inputTokens: 10, outputTokens: 2
    } }).success).toBe(true)
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'USAGE', payload: {
      providerId: 'openai', accountId: 'a1', requests: 1, inputTokens: 10, outputTokens: 2,
      secret: 'forbidden'
    } }).success).toBe(false)
  })
})
