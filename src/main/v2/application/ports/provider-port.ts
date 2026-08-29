import type {
  ModelCapabilities,
  ProviderAccountSummary,
  ProviderSummary,
  RuntimeTarget
} from '../../../../shared/v2/contracts/provider'

export interface ModelDescriptor {
  id: string
  name: string
  capabilities: ModelCapabilities
}

export interface ProviderRuntime {
  run(input: unknown): AsyncIterable<unknown>
}

export interface ProviderPort {
  listProviders(): Promise<ProviderSummary[]>
  listAccounts(): Promise<ProviderAccountSummary[]>
  listModels(accountId: string): Promise<ModelDescriptor[]>
  createRuntime(target: RuntimeTarget): Promise<ProviderRuntime>
}
