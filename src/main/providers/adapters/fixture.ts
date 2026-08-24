import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAccount } from '../../../shared/types'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'

const models: ProviderModel[] = [{ id: 'fixture-code', name: 'Fixture Code', capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true, speedModes: ['standard', 'fast'] } }]

export function createFixtureAdapter(): ProviderAdapter {
  return {
    capability: {
      id: 'fixture',
      displayName: 'Fixture Provider',
      description: 'Local test provider for connection and account flows',
      methods: [
        { id: 'api-key', label: 'API key', description: 'Use a test API key', kind: 'api-key', fields: ['apiKey'] },
        { id: 'imported', label: 'Import JSON', description: 'Import a test credential JSON', kind: 'imported', fields: ['credentialJson'] }
      ],
      status: 'ready',
      chatTransport: 'openai-compatible'
    },
    definition() { return this.capability },
    async connect(request, context) {
      const label = request.fields.label?.trim() || 'Fixture account'
      const account = context.saveAccount({ providerId: 'fixture', label, authMode: request.methodId === 'api-key' ? 'api-key' : 'imported', status: 'active', profile: { name: label } }, { apiKey: request.fields.apiKey ?? request.fields.credentialJson })
      return { account }
    },
    async refreshAccount(account) { return account },
    async listModels(_account, _secret) { return models },
    createRuntime(_account, secret, model) {
      return createLlm('openai-compatible', secret.apiKey ?? '', 'http://127.0.0.1:9', undefined)
    }
  }
}
