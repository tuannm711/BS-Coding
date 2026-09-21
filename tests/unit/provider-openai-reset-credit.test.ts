import { describe, expect, it, vi } from 'vitest'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'

describe('consumeResetCredit via Codex App Server', () => {
  it('exposes OpenAI adapter capability correctly', () => {
    const adapter = createOpenAiAdapter()
    expect(adapter.capability.id).toBe('openai')
    expect(adapter.capability.chatTransport).toBe('codex-app-server')
  })
})
