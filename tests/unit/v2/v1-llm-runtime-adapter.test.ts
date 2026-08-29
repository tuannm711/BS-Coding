import { describe, expect, it } from 'vitest'
import { V1LlmRuntimeAdapter } from '../../../src/main/v2/infrastructure/runtime/v1-llm-runtime-adapter'

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = []
  for await (const value of stream) values.push(value)
  return values
}

describe('V1LlmRuntimeAdapter', () => {
  it('normalizes legacy stream parts without leaking provider metadata', async () => {
    const adapter = new V1LlmRuntimeAdapter(async () => ({
      async *stream() {
        yield { kind: 'text', text: 'hello' }
        yield { kind: 'reasoning', text: 'hidden' }
        yield { kind: 'tool-call', toolCallId: 'c1', toolName: 'read',
          toolInput: { path: 'a.ts' }, thoughtSignature: 'provider-secret' }
        yield { kind: 'finish', finishReason: 'stop' }
        yield { kind: 'error', error: 'late error' }
      }
    }), { now: () => '2026-08-29T00:00:00.000Z' })
    const client = await adapter.open({ providerId: 'p', accountId: 'a', modelId: 'm',
      capabilities: { structuredTools: 'VERIFIED' } })
    const parts = await collect(client.stream({ context: {
      system: [], goal: 'g', history: [], artifacts: [], toolSchemas: [], maxInputTokens: 100
    } }))
    expect(parts).toEqual([
      { kind: 'text-delta', text: 'hello' },
      { kind: 'reasoning-delta', text: 'hidden' },
      { kind: 'tool-call', call: { callId: 'c1', toolName: 'read', arguments: { path: 'a.ts' },
        origin: 'model', requestedAt: '2026-08-29T00:00:00.000Z' } },
      { kind: 'finish', reason: 'stop' },
      { kind: 'error', error: { code: 'LEGACY_RUNTIME_ERROR', message: 'late error' } }
    ])
    expect(JSON.stringify(parts)).not.toContain('thoughtSignature')
  })
})
