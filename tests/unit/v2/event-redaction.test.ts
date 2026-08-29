import { describe, expect, it } from 'vitest'
import { createEventFactory } from '../../../src/main/v2/runtime/canonical/event-factory'
import { redactEventPayload } from '../../../src/main/v2/runtime/canonical/event-redaction'

describe('canonical event redaction', () => {
  it('recursively redacts credential-like fields without mutating input', () => {
    const input = {
      authorization: 'Bearer root',
      nested: { apiKey: 'key', values: [{ refreshToken: 'token' }, { safe: 'ok' }] }
    }
    expect(redactEventPayload(input)).toEqual({
      authorization: '[REDACTED]',
      nested: { apiKey: '[REDACTED]', values: [{ refreshToken: '[REDACTED]' }, { safe: 'ok' }] }
    })
    expect(input.nested.apiKey).toBe('key')
  })
})

describe('canonical event factory', () => {
  it('creates a versioned event with injected identity and time', () => {
    const factory = createEventFactory({
      clock: { now: () => '2026-08-29T00:00:00.000Z' },
      ids: { next: () => 'event-1' }
    })
    expect(factory.create({
      type: 'USER_MESSAGE', projectId: 'p', workSessionId: 'w', correlationId: 'corr',
      payload: { text: 'hello' }
    })).toEqual({
      id: 'event-1', schemaVersion: 1, timestamp: '2026-08-29T00:00:00.000Z',
      type: 'USER_MESSAGE', projectId: 'p', workSessionId: 'w', correlationId: 'corr',
      payload: { text: 'hello' }
    })
  })

  it('rejects missing canonical correlation identity', () => {
    const factory = createEventFactory({
      clock: { now: () => '2026-08-29T00:00:00.000Z' }, ids: { next: () => 'event-1' }
    })
    expect(() => factory.create({
      type: 'USER_MESSAGE', projectId: '', correlationId: '', payload: { text: 'hello' }
    })).toThrow(/correlation/i)
  })
})
