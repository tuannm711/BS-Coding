import type { ProviderAdapter } from '../types'

export function createAntigravityAdapter(): ProviderAdapter {
  const capability = {
    id: 'antigravity',
    displayName: 'Google Antigravity (Deprecated)',
    description: 'Deprecated legacy OAuth connection. Please use Google / Gemini API Key.',
    methods: [],
    status: 'unavailable' as const,
    chatTransport: 'cloud-code' as const
  }

  return {
    capability,
    definition() { return capability },
    async connect() {
      throw new Error('[bs] Antigravity OAuth cũ không còn được hỗ trợ để đảm bảo ToS Google. Vui lòng sử dụng kết nối chính thức Google Gemini API Key hoặc Vertex AI.')
    },
    async refreshAccount(account) {
      return {
        ...account,
        status: 'error',
        lastError: 'Phương thức Antigravity OAuth đã bị ngừng hỗ trợ để tuân thủ ToS. Vui lòng kết nối lại bằng Google Gemini API Key.'
      }
    },
    async listModels() {
      return []
    },
    createRuntime() {
      throw new Error('[bs] Antigravity OAuth cũ không còn được hỗ trợ. Vui lòng chuyển sang nhà cung cấp Google / Gemini.')
    }
  }
}
