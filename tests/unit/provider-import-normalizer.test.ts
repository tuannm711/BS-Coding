import { describe, expect, it } from 'vitest'
import { normalizeProviderImport, ProviderAuthError } from '../../src/main/providers/auth/import-normalizer'

describe('provider import normalization', () => {
  it('normalizes token JSON and strips unknown secret fields', () => {
    expect(normalizeProviderImport('grok', JSON.stringify({ accessToken: 'a', refreshToken: 'r', baseUrl: 'https://x.test', ignored: 'secret' }))).toEqual({ accessToken: 'a', refreshToken: 'r', baseUrl: 'https://x.test' })
  })

  it('rejects malformed or incomplete credential JSON', () => {
    expect(() => normalizeProviderImport('cursor', '{')).toThrowError(ProviderAuthError)
    expect(() => normalizeProviderImport('cursor', JSON.stringify({ profile: 'only' }))).toThrow('apiKey or accessToken')
  })
})
