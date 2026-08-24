import type { ProviderSecrets } from '../../connections/types'

export class ProviderAuthError extends Error {
  constructor(public readonly code: 'invalid-import' | 'unsupported-runtime', message: string) {
    super(`[bs] ${message}`)
    this.name = 'ProviderAuthError'
  }
}

export function normalizeProviderImport(_providerId: string, raw: string): ProviderSecrets {
  let parsed: Record<string, unknown>
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object')
    parsed = value as Record<string, unknown>
  } catch {
    throw new ProviderAuthError('invalid-import', 'Credential JSON không hợp lệ')
  }
  const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken : undefined
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey : undefined
  if (!accessToken && !apiKey) throw new ProviderAuthError('invalid-import', 'Credential JSON phải có apiKey or accessToken')
  const secret: ProviderSecrets = { apiKey, accessToken }
  for (const key of ['refreshToken', 'idToken', 'accountId', 'baseUrl']) {
    const value = parsed[key]
    if (typeof value === 'string') secret[key as keyof ProviderSecrets] = value as never
  }
  return secret
}
