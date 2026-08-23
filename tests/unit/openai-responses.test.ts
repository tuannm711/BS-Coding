import { describe, expect, it, vi } from 'vitest'
import { OpenAIResponsesClient } from '../../src/main/agent/openai-responses'

describe('OpenAIResponsesClient', () => {
  it('sends Responses payload and stores continuation id', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'resp-1', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({ apiKey: 'sk-test', fetchImpl })
    const parts = []
    for await (const part of client.stream({ model: 'gpt-5.2-codex', system: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], tools: [] })) parts.push(part)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1] && (fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ store: false })
    expect(parts).toContainEqual({ kind: 'text', text: 'ok' })
    expect(client.state.previousResponseId).toBe('resp-1')
  })

  it('stores opaque compaction output and clears continuation', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [{ type: 'compaction', encrypted_content: 'opaque' }] }), { status: 200 })) as unknown as typeof fetch
    const state = { previousResponseId: 'old' }
    const client = new OpenAIResponsesClient({ apiKey: 'sk-test', state, fetchImpl })
    expect(await client.compact([{ role: 'user', content: 'history' }], 'gpt-5.2-codex')).toBe(true)
    expect(state.previousResponseId).toBeUndefined()
    expect(state.compactedInput).toEqual([{ type: 'compaction', encrypted_content: 'opaque' }])
  })

  it('supports ChatGPT Codex backend headers for OAuth sessions', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output: [] }), { status: 200 })) as unknown as typeof fetch
    const client = new OpenAIResponsesClient({
      apiKey: 'oauth-token',
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      headers: { 'ChatGPT-Account-ID': 'acct-1', originator: 'codex_vscode' },
      fetchImpl
    })
    for await (const _part of client.stream({ model: 'gpt-5.5', system: 'sys', messages: [], tools: [] })) { /* consume */ }
    expect(fetchImpl).toHaveBeenCalledWith('https://chatgpt.com/backend-api/codex/responses', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer oauth-token', 'ChatGPT-Account-ID': 'acct-1', originator: 'codex_vscode' })
    }))
  })
})
