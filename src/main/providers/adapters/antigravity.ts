import type { ProviderAdapter } from '../types'
import { createAntigravityLlm } from '../../agent/antigravity-llm'

const ANTIGRAVITY_CODE_MODELS = [
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (High)' },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (Low)' },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' }
] as const

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
    async listModels() {
      return ANTIGRAVITY_CODE_MODELS.map(model => ({ ...model, capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true } }))
    },
    createClient(_account, secret) {
      if (!secret.accessToken) throw new Error('[bs] Antigravity OAuth access token unavailable')
      return createAntigravityLlm(secret.accessToken)
    }
  }
}
