import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenAiAdapter } from '../../src/main/providers/adapters/openai'
import type { ProviderAccount } from '../../src/shared/types'

const account: ProviderAccount = {
  id: 'a1', providerId: 'openai', label: 'x', authMode: 'oauth',
  status: 'active', createdAt: 1, lastUsedAt: 1
}
const newSecret = () => ({ accessToken: 'token', refreshToken: 'refresh', accountId: 'acct' })
const consume = (secret = newSecret()) => createOpenAiAdapter().consumeResetCredit!(account, secret)
const CONSUME_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume'

afterEach(() => { vi.unstubAllGlobals() })

describe('consumeResetCredit', () => {
  it('posts a redeem request id to the consume endpoint', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await consume()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(CONSUME_URL)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body)).redeem_request_id).toBeTruthy()
  })

  it('reuses the same redeem request id after a 401', async () => {
    // A fresh id on the retry spends two credits. This is the whole reason the
    // id is generated before the first attempt rather than inside it.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"access_token":"new","refresh_token":"r2","id_token":"","expires_in":3600}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await consume()
    const posts = fetchMock.mock.calls.filter(call => String(call[0]) === CONSUME_URL)
    expect(posts).toHaveLength(2)
    expect(JSON.parse(String(posts[0][1]?.body)).redeem_request_id)
      .toBe(JSON.parse(String(posts[1][1]?.body)).redeem_request_id)
  })

  it('throws when the endpoint refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 400 })))
    await expect(consume()).rejects.toThrow('400')
  })
})
