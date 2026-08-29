import type { ModelDescriptor, ProviderPort, ProviderRuntime } from '../../application/ports/provider-port'
import type { ProviderAccountSummary, ProviderSummary, RuntimeTarget } from '../../../../shared/v2/contracts/provider'

interface LegacyProviderSource {
  listProviders(): Promise<Array<Record<string, unknown>>>
  listAccounts(): Promise<Array<Record<string, unknown>>>
  listModels(accountId: string): Promise<Array<Record<string, unknown>>>
  createRuntime(target: RuntimeTarget): Promise<ProviderRuntime>
}

const unknownCapabilities = {
  streaming: 'UNKNOWN', structuredTools: 'UNKNOWN', parallelTools: 'UNKNOWN',
  toolChoice: 'UNKNOWN', reasoning: 'UNKNOWN', images: 'UNKNOWN',
  structuredOutput: 'UNKNOWN', nativeResume: 'UNKNOWN'
} as const

// Delete after P18 migration and V2 provider adapters cover every enabled provider.
export class V1ProviderCompat implements ProviderPort {
  constructor(private readonly legacy: LegacyProviderSource) {}

  async listProviders(): Promise<ProviderSummary[]> {
    return (await this.legacy.listProviders()).map(value => ({
      id: String(value.id), name: String(value.name), enabled: value.enabled !== false
    }))
  }

  async listAccounts(): Promise<ProviderAccountSummary[]> {
    return (await this.legacy.listAccounts()).map(value => ({
      id: String(value.id), providerId: String(value.providerId), enabled: value.enabled !== false,
      status: value.status === 'connected' ? 'HEALTHY' : 'UNKNOWN'
    }))
  }

  async listModels(accountId: string): Promise<ModelDescriptor[]> {
    return (await this.legacy.listModels(accountId)).map(value => ({
      id: String(value.id), name: String(value.name),
      capabilities: { ...unknownCapabilities,
        ...(typeof value.contextWindow === 'number' ? { contextWindow: value.contextWindow } : {}) }
    }))
  }

  createRuntime(target: RuntimeTarget): Promise<ProviderRuntime> {
    return this.legacy.createRuntime(target)
  }
}
