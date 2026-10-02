import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseGitHubCopilotModels, copilotApiBaseUrl } from '../../src/main/providers/github-copilot-models'
import { createGitHubCopilotAdapter } from '../../src/main/providers/adapters/github-copilot'
import { refreshGitHubCopilotCredentials } from '../../src/main/providers/auth/github-copilot-oauth'

afterEach(() => vi.unstubAllGlobals())
const account = { id: 'copilot', providerId: 'github-copilot', label: 'Copilot', authMode: 'oauth' as const, status: 'active' as const, createdAt: 1, lastUsedAt: 1, models: ['old-static-model'], profile: { planName: 'pro' } }
const entry = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: `Name ${id}`, model_picker_enabled: true, policy: { state: 'enabled' }, capabilities: { type: 'chat', supports: { streaming: true, tool_calls: true }, limits: { max_context_window_tokens: 200000, max_output_tokens: 64000 } }, ...patch })

describe('GitHub Copilot remote catalog', () => {
  it('uses remote exact IDs/names/limits, de-duplicates and routes Responses-only models', () => {
    const models = parseGitHubCopilotModels({ data: [entry('a'), entry('b', { supported_endpoints: ['/responses'] }), entry('c'), entry('a')] }, 'pro')
    expect(models.map(model => model.id)).toEqual(['a', 'b', 'c'])
    expect(models[0]).toMatchObject({ name: 'Name a', transport: 'openai-compatible', capabilities: { contextWindow: 200000, maxOutputTokens: 64000, supportsStreaming: true, supportsTools: true } })
    expect(models[1].transport).toBe('openai-responses')
  })
  it('excludes hidden, disabled, non-chat, unsupported tools/streaming/endpoints and other plans', () => {
    const models = parseGitHubCopilotModels({ data: [entry('allowed'), entry('hidden', { model_picker_enabled: false }), entry('disabled', { policy: { state: 'disabled' } }), entry('messages', { supported_endpoints: ['/messages'] }), entry('premium-only', { billing: { restricted_to: ['pro_plus'] } }), entry('embedding', { capabilities: { type: 'embeddings', supports: { streaming: true, tool_calls: true } } }), entry('no-tools', { capabilities: { type: 'chat', supports: { streaming: true, tool_calls: false } } }), entry('no-stream', { capabilities: { type: 'chat', supports: { streaming: false, tool_calls: true } } }), entry('unknown', { capabilities: {} })] }, 'pro')
    expect(models.map(model => model.id)).toEqual(['allowed'])
  })
  it('does not accept malformed catalogs or guessed limits', () => {
    expect(() => parseGitHubCopilotModels({})).toThrow(/catalog/i)
    const model = parseGitHubCopilotModels({ data: [entry('valid', { capabilities: { type: 'chat', supports: { streaming: true, tool_calls: true }, limits: { max_context_window_tokens: -1, max_prompt_tokens: 1000, max_output_tokens: '1000' } } })] })[0]
    expect(model.capabilities?.contextWindow).toBeUndefined()
    expect(model.capabilities?.maxOutputTokens).toBeUndefined()
  })
  it('does not turn malformed access flags or restriction policy into model availability', () => {
    expect(parseGitHubCopilotModels({ data: [entry('string-flag', { model_picker_enabled: 'false' }), entry('bad-policy', { policy: 'disabled' }), entry('bad-restriction', { billing: { restricted_to: 'pro_plus' } }), entry('bad-enabled', { enabled: 'false' }), entry('bad-disabled', { disabled: 'true' })] }, 'pro')).toEqual([])
  })
  it('requires explicit picker permission and enabled policy instead of assuming missing access metadata', () => {
    const models = parseGitHubCopilotModels({ data: [
      entry('confirmed'),
      entry('missing-picker', { model_picker_enabled: undefined }),
      entry('missing-policy', { policy: undefined }),
      entry('empty-policy', { policy: {} }),
      entry('null-picker', { model_picker_enabled: null }),
      entry('null-state', { policy: { state: null } })
    ] }, 'pro')
    expect(models.map(model => model.id)).toEqual(['confirmed'])
  })
  it('fetches the account catalog instead of using its stored two-model list', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => Response.json({ data: [entry('a'), entry('b'), entry('c')] }))
    vi.stubGlobal('fetch', fetch)
    const models = await createGitHubCopilotAdapter().listModels(account, { accessToken: 'runtime', githubAccessToken: 'identity' })
    expect(models.map(model => model.id)).toEqual(['a', 'b', 'c'])
    expect(fetch.mock.calls[0][0]).toBe('https://api.githubcopilot.com/models')
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer runtime')
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })
  it('fails visibly on discovery error or no compatible models, without static fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    await expect(createGitHubCopilotAdapter().listModels(account, { accessToken: 'runtime' })).rejects.toThrow(/503/)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: [entry('unsupported', { supported_endpoints: ['/messages'] })] })))
    await expect(createGitHubCopilotAdapter().listModels(account, { accessToken: 'runtime' })).rejects.toThrow(/compatible/i)
  })
  it('honors only HTTPS Copilot API endpoints, including account-specific routing', () => {
    expect(copilotApiBaseUrl()).toBe('https://api.githubcopilot.com')
    expect(copilotApiBaseUrl('https://api.individual.githubcopilot.com/')).toBe('https://api.individual.githubcopilot.com')
    for (const url of ['http://api.githubcopilot.com', 'https://api.githubcopilot.com.attacker.test', 'https://user:secret@api.githubcopilot.com', 'https://api.githubcopilot.com/path']) expect(() => copilotApiBaseUrl(url)).toThrow()
  })
  it('preserves the API endpoint from minted credentials and uses it for discovery', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input); requests.push(url)
      if (url.endsWith('/copilot_internal/v2/token')) return Response.json({ token: 'fresh-runtime', endpoints: { api: 'https://api.individual.githubcopilot.com' } })
      if (url.endsWith('/copilot_internal/user')) return Response.json({ copilot_plan: 'pro' })
      if (url.endsWith('/models')) return Response.json({ data: [entry('account-model')] })
      throw new Error('Unexpected fixture endpoint')
    }))
    const secret = await refreshGitHubCopilotCredentials('identity')
    expect(secret.baseUrl).toBe('https://api.individual.githubcopilot.com')
    await createGitHubCopilotAdapter().listModels(account, secret)
    expect(requests.at(-1)).toBe('https://api.individual.githubcopilot.com/models')
  })
  it('routes an advertised Responses-only model through the existing Responses client', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
      return Response.json({ id: 'response', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'response complete' }] }] })
    }))
    const model = parseGitHubCopilotModels({ data: [entry('exact-response-id', { supported_endpoints: ['/responses'] })] })[0]
    const client = createGitHubCopilotAdapter().createRuntime(account, { accessToken: 'runtime', baseUrl: 'https://api.individual.githubcopilot.com' }, model)
    const parts = []
    for await (const part of client.stream({ model: model.id, system: '', messages: [{ role: 'user', content: 'hello' }], tools: [] })) parts.push(part)
    expect(requests[0].url).toBe('https://api.individual.githubcopilot.com/responses')
    expect(requests[0].body.model).toBe('exact-response-id')
    expect(parts).toContainEqual({ kind: 'text', text: 'response complete' })
  })
  it('uses authenticated account plan metadata for imported identity credentials instead of a supplied plan claim', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith('/copilot_internal/user')) return Response.json({ copilot_plan: 'pro' })
      return Response.json({ data: [entry('pro-model', { billing: { restricted_to: ['pro'] } }), entry('other-plan', { billing: { restricted_to: ['pro_plus'] } })] })
    }))
    const saved: any[] = []
    const result = await createGitHubCopilotAdapter().connect({ providerId: 'github-copilot', methodId: 'imported', fields: { credentialJson: JSON.stringify({ accessToken: 'runtime', githubAccessToken: 'identity', planName: 'pro_plus' }) } }, {
      saveAccount: (account, secret) => { saved.push({ account, secret }); return { ...account, id: 'imported', createdAt: 1, lastUsedAt: 1 } }
    })
    expect(result.account.models).toEqual(['pro-model'])
    expect(saved[0].secret.planName).toBe('pro')
  })
})
