import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startGitHubCopilotDeviceAuthorization, refreshGitHubCopilotCredentials } from '../../src/main/providers/auth/github-copilot-oauth'

describe('Copilot device authorization', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function fixture(errors: string[] = []) {
    const calls: Array<{ url: string; at: number; body: string }> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, at: Date.now(), body: String(init?.body ?? '') })
      if (url.endsWith('/login/device/code')) return Response.json({ device_code: 'private-device', user_code: 'ABCD-EFGH', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5 })
      if (url.endsWith('/login/oauth/access_token')) return Response.json(errors.length ? { error: errors.shift() } : { access_token: 'github-token' })
      if (url.endsWith('/user')) return Response.json({ login: 'octocat', email: 'octo@example.com' })
      if (url.endsWith('/copilot_internal/v2/token')) return Response.json({ token: 'runtime', expires_at: 2_000_000_000, chat_enabled: true })
      if (url.endsWith('/copilot_internal/user')) return Response.json({ copilot_plan: 'pro' })
      throw new Error(`Unexpected endpoint ${url}`)
    }) as typeof fetch
    return { calls, fetchImpl }
  }

  it('uses a supported REST version for profile, private email and Copilot credentials', async () => {
    const f = fixture()
    const restRequests: Array<{ url: string; apiVersion: string | null }> = []
    const strictFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com/')) {
        const apiVersion = new Headers(init?.headers).get('x-github-api-version')
        restRequests.push({ url, apiVersion })
        if (apiVersion !== '2022-11-28') return Response.json({ message: 'Bad Request' }, { status: 400 })
        if (url === 'https://api.github.com/user') return Response.json({ login: 'octocat', email: null })
        if (url === 'https://api.github.com/user/emails') return Response.json([{ email: 'private@example.com', primary: true, verified: true }])
      }
      return f.fetchImpl(input, init)
    }
    const handle = await startGitHubCopilotDeviceAuthorization(new AbortController().signal, strictFetch)
    const completion = handle.complete().then(result => ({ result }), error => ({ error }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(await completion).toMatchObject({ result: { profile: { login: 'octocat', email: 'private@example.com' }, secrets: { accessToken: 'runtime' } } })
    expect(restRequests.map(request => request.url)).toEqual(['https://api.github.com/user', 'https://api.github.com/user/emails', 'https://api.github.com/copilot_internal/v2/token', 'https://api.github.com/copilot_internal/user'])
    expect(restRequests.every(request => request.apiVersion === '2022-11-28')).toBe(true)
    expect(await refreshGitHubCopilotCredentials('github-token', strictFetch)).toMatchObject({ accessToken: 'runtime' })
    expect(restRequests).toHaveLength(6)
  })

  it('waits for the minimum interval, handles pending and slow_down and exchanges the device grant', async () => {
    const f = fixture(['authorization_pending', 'slow_down'])
    const handle = await startGitHubCopilotDeviceAuthorization(new AbortController().signal, f.fetchImpl)
    expect(handle).toMatchObject({ authUrl: 'https://github.com/login/device', userCode: 'ABCD-EFGH' })
    const done = handle.complete()
    await vi.advanceTimersByTimeAsync(4999)
    expect(f.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await vi.advanceTimersByTimeAsync(5000)
    await vi.advanceTimersByTimeAsync(9999)
    expect(f.calls.filter(c => c.url.endsWith('/access_token'))).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect((await done).secrets).toMatchObject({ githubAccessToken: 'github-token', accessToken: 'runtime' })
    const tokenCalls = f.calls.filter(c => c.url.endsWith('/access_token'))
    expect(tokenCalls.map(c => c.at - tokenCalls[0].at)).toEqual([0, 5000, 15000])
    expect(new URLSearchParams(tokenCalls[0].body).get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code')
    expect(tokenCalls[0].body).not.toContain('client_secret')
    expect(tokenCalls[0].body).not.toContain('code_verifier')
  })

  it.each(['access_denied', 'expired_token', 'incorrect_device_code'])('stops on %s', async error => {
    const f = fixture([error])
    const handle = await startGitHubCopilotDeviceAuthorization(new AbortController().signal, f.fetchImpl)
    const assertion = expect(handle.complete()).rejects.toThrow(/denied|expired|incorrect_device_code/i)
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
    expect(f.calls).toHaveLength(2)
  })

  it('cancels a polling wait without more requests or leftover timers', async () => {
    const f = fixture()
    const controller = new AbortController()
    const handle = await startGitHubCopilotDeviceAuthorization(controller.signal, f.fetchImpl)
    const assertion = expect(handle.complete()).rejects.toThrow()
    controller.abort()
    await assertion
    await vi.advanceTimersByTimeAsync(900_000)
    expect(f.calls).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
