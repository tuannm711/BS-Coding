import { describe, expect, it, vi, beforeEach } from 'vitest'

const streamTextMock = vi.fn()
const { createOpenAICompatibleMock } = vi.hoisted(() => ({
  createOpenAICompatibleMock: vi.fn()
}))

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  jsonSchema: (s: unknown) => s,
  tool: (t: unknown) => t
}))

vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: (opts: unknown) => {
    createOpenAICompatibleMock(opts)
    return { chatModel: (modelId: string) => ({ provider: 'mock-openai-compatible', modelId }) }
  }
}))

import { createAnthropicLlm, createLlm, createOpenAICompatibleLlm, formatLlmError, toMessageTokens } from '../../src/main/agent/llm'
import type { LlmStreamPart } from '../../src/main/agent/llm'

function fakeFullStream(parts: Array<Record<string, unknown>>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const p of parts) yield p
    }
  }
}

beforeEach(() => {
  streamTextMock.mockReset()
  createOpenAICompatibleMock.mockReset()
})

describe('stream usage contract', () => {
  it('subtracts known cache categories when the SDK omits noCacheTokens', () => {
    expect(toMessageTokens({ inputTokens: 100, outputTokens: 25, totalTokens: 125, cachedInputTokens: 40, cacheCreationInputTokens: 10, reasoningTokens: 5 })).toEqual({ input: 50, output: 25, total: 125, cacheRead: 40, cacheWrite: 10, reasoning: 5 })
    expect(toMessageTokens({ inputTokens: undefined, outputTokens: undefined, totalTokens: undefined })).toBeUndefined()
    expect(toMessageTokens({ inputTokens: Number.NaN, outputTokens: 1 })).toBeUndefined()
  })

  it('requests usage for compatible providers and applies the supplied output budget', async () => {
    streamTextMock.mockReturnValue({ fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }]) })
    const parts: LlmStreamPart[] = []
    for await (const part of createLlm('github-copilot', 'fixture', 'https://fixture.invalid/v1').stream({ model: 'fixture', system: '', messages: [], tools: [], maxOutputTokens: 32768 } as any)) parts.push(part)
    expect(createOpenAICompatibleMock.mock.calls[0][0].includeUsage).toBe(true)
    expect(streamTextMock.mock.calls[0][0].maxOutputTokens).toBe(32768)
    expect(parts.at(-1)?.tokens).toEqual({ input: 2, output: 3, total: 5 })
  })

  it('falls back without usage only when a compatible endpoint rejects stream_options before output', async () => {
    streamTextMock.mockReturnValueOnce({ fullStream: fakeFullStream([{ type: 'error', error: { statusCode: 400, message: 'Unsupported field stream_options.include_usage' } }]) })
      .mockReturnValueOnce({ fullStream: fakeFullStream([{ type: 'text-delta', text: 'ok' }, { type: 'finish', finishReason: 'stop' }]) })
    const parts: LlmStreamPart[] = []
    for await (const part of createLlm('compatible', 'fixture', 'https://fixture.invalid/v1').stream({ model: 'fixture', system: '', messages: [], tools: [] })) parts.push(part)
    expect(parts).toEqual([{ kind: 'text', text: 'ok' }, { kind: 'finish', finishReason: 'stop' }])
    expect(createOpenAICompatibleMock.mock.calls.map(call => call[0].includeUsage)).toEqual([true, false])
  })

  it('does not replay visible text when a compatible stream fails after output', async () => {
    streamTextMock.mockReturnValue({ fullStream: fakeFullStream([{ type: 'text-delta', text: 'partial' }, { type: 'error', error: { statusCode: 400, message: 'Unsupported field stream_options.include_usage' } }]) })
    const parts: LlmStreamPart[] = []
    for await (const part of createLlm('compatible', 'fixture', 'https://fixture.invalid/v1').stream({ model: 'fixture', system: '', messages: [], tools: [] })) parts.push(part)
    expect(parts.map(part => part.kind)).toEqual(['text', 'error'])
    expect(createOpenAICompatibleMock.mock.calls).toHaveLength(1)
  })
})

describe('createAnthropicLlm', () => {
  it('maps text-delta and finish parts into LlmStreamPart', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([
        { type: 'text-delta', id: '1', text: 'hel' },
        { type: 'text-delta', id: '2', text: 'lo' },
        { type: 'finish', finishReason: 'stop' }
      ])
    })
    const llm = createAnthropicLlm('sk-test')
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({
      model: 'claude-x', system: 'sys', messages: [{ role: 'user', content: 'hi' }], tools: []
    })) {
      out.push(p)
    }
    expect(out).toEqual([
      { kind: 'text', text: 'hel' },
      { kind: 'text', text: 'lo' },
      { kind: 'finish', finishReason: 'stop' }
    ])
    const call = streamTextMock.mock.calls[0][0]
    expect(call.system).toBe('sys')
    expect(call.abortSignal).toBeUndefined()
  })

  it('maps tool-call parts and passes the abort signal', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([
        { type: 'tool-call', toolCallId: 'tc1', toolName: 'read', input: { file_path: 'a.ts' } },
        { type: 'finish', finishReason: 'tool-calls' }
      ])
    })
    const llm = createAnthropicLlm('sk-test')
    const signal = new AbortController().signal
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({
      model: 'claude-x', system: 'sys',
      messages: [{ role: 'user', content: 'x' }],
      tools: [{ name: 'read', description: 'd', schema: {} as never, run: async () => ({}) }],
      signal
    })) {
      out.push(p)
    }
    expect(out[0]).toEqual({
      kind: 'tool-call', toolCallId: 'tc1', toolName: 'read', toolInput: { file_path: 'a.ts' }
    })
    const call = streamTextMock.mock.calls[0][0]
    expect(call.abortSignal).toBe(signal)
    expect(call.tools.read).toBeDefined()
  })

  it('maps error parts', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'error', error: new Error('boom') }])
    })
    const llm = createAnthropicLlm('sk-test')
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({ model: 'm', system: 's', messages: [], tools: [] })) {
      out.push(p)
    }
    expect(out).toEqual([{ kind: 'error', error: 'Error: boom' }])
  })

  it('maps reasoning deltas and finish tokens', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([
        { type: 'reasoning-delta', id: 'r1', text: 'think ' },
        { type: 'reasoning-delta', id: 'r2', text: 'more' },
        { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }
      ])
    })
    const llm = createAnthropicLlm('sk-test')
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({ model: 'm', system: 's', messages: [], tools: [] })) {
      out.push(p)
    }
    expect(out[0]).toEqual({ kind: 'reasoning', text: 'think ' })
    expect(out[1]).toEqual({ kind: 'reasoning', text: 'more' })
    expect(out[2]).toEqual({ kind: 'finish', finishReason: 'stop', tokens: { input: 10, output: 5, total: 15 } })
  })

  it('adds anthropic cache breakpoints on the system and first/last messages', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    const llm = createAnthropicLlm('sk-test')
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'user' as const, content: 'mid' },
      { role: 'user' as const, content: 'last' }
    ]
    for await (const p of llm.stream({ model: 'claude-x', system: 'sys', messages, tools: [] })) {
      void p
    }
    const call = streamTextMock.mock.calls[0][0]
    expect(call.providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } })
    expect(call.messages[0].providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } })
    expect(call.messages[1].providerOptions).toBeUndefined()
    expect(call.messages[2].providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } })
  })

  it('adds a single breakpoint when the history has one message and merges variant options', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    const llm = createAnthropicLlm('sk-test')
    const messages = [{ role: 'user' as const, content: 'only' }]
    for await (const p of llm.stream({
      model: 'claude-x', system: 'sys', messages, tools: [],
      variantOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 1024 } } }
    })) {
      void p
    }
    const call = streamTextMock.mock.calls[0][0]
    expect(call.providerOptions).toEqual({
      anthropic: {
        cacheControl: { type: 'ephemeral' },
        thinking: { type: 'enabled', budgetTokens: 1024 }
      }
    })
    expect(call.messages).toHaveLength(1)
    expect(call.messages[0].providerOptions).toEqual({ anthropic: { cacheControl: { type: 'ephemeral' } } })
  })

  it('does not add cache breakpoints for openai-compatible providers', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    const llm = createOpenAICompatibleLlm({ apiKey: 'k', baseUrl: 'http://localhost:11434/v1' })
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'user' as const, content: 'last' }
    ]
    for await (const p of llm.stream({ model: 'llama3', system: 's', messages, tools: [] })) {
      void p
    }
    const call = streamTextMock.mock.calls[0][0]
    expect(call.providerOptions).toBeUndefined()
    expect(call.messages[0].providerOptions).toBeUndefined()
    expect(call.messages[1].providerOptions).toBeUndefined()
  })
})

describe('formatLlmError', () => {
  it('extracts the response body message for an API call error', () => {
    const err = {
      name: 'APICallError',
      statusCode: 401,
      url: 'https://api.deepseek.com/chat/completions',
      responseBody: '{"error":{"message":"Authentication Fails, Your api key is invalid"}}'
    }
    expect(formatLlmError(err)).toBe('Authentication Fails, Your api key is invalid')
  })

  it('falls back to a concise status line when the body is not JSON', () => {
    const err = { name: 'APICallError', statusCode: 429, responseBody: 'rate limited' }
    expect(formatLlmError(err)).toBe('rate limited')
  })

  it('unwraps a RetryError to surface the underlying API error', () => {
    const err = {
      name: 'AI_RetryError',
      lastError: {
        name: 'APICallError',
        statusCode: 401,
        url: 'https://api.deepseek.com/chat/completions',
        responseBody: '{"error":{"message":"Authentication Fails, Your api key is invalid"}}'
      }
    }
    expect(formatLlmError(err)).toBe('Authentication Fails, Your api key is invalid')
  })

  it('reports a 401 with a raw non-JSON body like DeepSeek governance errors', () => {
    const err = {
      name: 'APICallError',
      statusCode: 401,
      url: 'https://api.deepseek.com/chat/completions',
      responseBody: 'Authentication Fails (governor)'
    }
    expect(formatLlmError(err)).toContain('Authentication Fails (governor)')
  })

  it('returns the raw string for plain errors', () => {
    expect(formatLlmError('boom')).toBe('boom')
  })
})

describe('createOpenAICompatibleLlm', () => {
  it('passes baseUrl and apiKey to the provider factory', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    const llm = createOpenAICompatibleLlm({ apiKey: 'k', baseUrl: 'http://localhost:11434/v1' })
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({ model: 'llama3', system: 's', messages: [], tools: [] })) {
      out.push(p)
    }
    expect(out).toEqual([{ kind: 'finish', finishReason: 'stop' }])
    const opts = createOpenAICompatibleMock.mock.calls[0][0]
    expect(opts.baseURL).toBe('http://localhost:11434/v1')
    expect(opts.apiKey).toBe('k')
    expect(opts.includeUsage).toBe(true)
  })
})

describe('DeepSeek usage capture', () => {
  async function streamOnce(llm: ReturnType<typeof createLlm>) {
    const out: LlmStreamPart[] = []
    for await (const p of llm.stream({ model: 'deepseek-chat', system: 's', messages: [], tools: [] })) {
      out.push(p)
    }
    return out
  }

  it('requests stream usage for the official api.deepseek.com endpoint', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    await streamOnce(createLlm('deepseek', 'k', 'https://api.deepseek.com'))
    const opts = createOpenAICompatibleMock.mock.calls[0][0]
    expect(opts.includeUsage).toBe(true)
    expect(typeof opts.convertUsage).toBe('function')
  })

  it('detects DeepSeek by baseUrl hostname even with a custom provider id', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    await streamOnce(createLlm('my-gateway', 'k', 'https://api.deepseek.com/v1'))
    const opts = createOpenAICompatibleMock.mock.calls[0][0]
    expect(opts.includeUsage).toBe(true)
  })

  it('requests stream usage for other OpenAI-compatible endpoints', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    await streamOnce(createLlm('ollama', 'k', 'http://localhost:11434/v1'))
    expect(createOpenAICompatibleMock.mock.calls[0][0].includeUsage).toBe(true)
  })

  it('maps prompt_cache_hit_tokens into cacheRead and reasoning tokens', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([{ type: 'finish', finishReason: 'stop' }])
    })
    await streamOnce(createLlm('deepseek', 'k', 'https://api.deepseek.com'))
    const convert = createOpenAICompatibleMock.mock.calls[0][0].convertUsage
    expect(convert({
      prompt_tokens: 1000,
      completion_tokens: 200,
      prompt_cache_hit_tokens: 700,
      completion_tokens_details: { reasoning_tokens: 50 }
    })).toEqual({
      inputTokens: { total: 1000, noCache: 300, cacheRead: 700, cacheWrite: undefined },
      outputTokens: { total: 200, text: 150, reasoning: 50 }
    })
  })

  it('surfaces streamed usage as tokens end-to-end', async () => {
    streamTextMock.mockReturnValue({
      fullStream: fakeFullStream([
        { type: 'finish', finishReason: 'stop', totalUsage: {
          inputTokens: 1000,
          outputTokens: 200,
          totalTokens: 1200,
          inputTokenDetails: { noCacheTokens: 300, cacheReadTokens: 700, cacheWriteTokens: undefined },
          reasoningTokens: 50
        } }
      ])
    })
    const out = await streamOnce(createLlm('deepseek', 'k', 'https://api.deepseek.com'))
    expect(out).toEqual([{ kind: 'finish', finishReason: 'stop', tokens: {
      input: 300, output: 200, total: 1200, reasoning: 50, cacheRead: 700, cacheWrite: undefined
    } }])
  })
})

describe('toMessageTokens', () => {
  it('maps the full AI SDK usage breakdown', () => {
    expect(toMessageTokens({
      inputTokens: 600, outputTokens: 20, totalTokens: 620,
      reasoningTokens: 8, cachedInputTokens: 500
    })).toEqual({ input: 100, output: 20, total: 620, reasoning: 8, cacheRead: 500, cacheWrite: undefined })
  })

  it('maps SDK v6 inputTokenDetails (noCache/cacheRead/cacheWrite) and cache creation', () => {
    expect(toMessageTokens({
      inputTokens: 630, outputTokens: 20, totalTokens: 650,
      cacheCreationInputTokens: 30,
      inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 30 }
    })).toEqual({ input: 100, output: 20, total: 650, reasoning: undefined, cacheRead: 500, cacheWrite: 30 })
  })

  it('leaves missing counters unknown', () => {
    expect(toMessageTokens({})).toBeUndefined()
  })

  it('returns undefined when the provider reports no usage', () => {
    expect(toMessageTokens(undefined)).toBeUndefined()
  })
})
