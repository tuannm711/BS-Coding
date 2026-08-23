import type { ProviderAdapter } from '../types'

export function createAntigravityAdapter(): ProviderAdapter {
  return {
    capability: {
      id: 'antigravity',
      displayName: 'Antigravity IDE',
      description: 'Google OAuth authorization for Antigravity IDE accounts',
      methods: [
        { id: 'oauth', label: 'OAuth authorization', description: 'Authorize with Google and store an offline refresh token', kind: 'oauth', fields: [], opensBrowser: true, supportsMultipleAccounts: true }
      ],
      status: 'experimental'
    },
    async connect() { throw new Error('[bs] Antigravity OAuth phải được bắt đầu qua login session') },
    async listModels() { return [] },
    createClient() { throw new Error('[bs] Antigravity model runtime chưa khả dụng') }
  }
}
