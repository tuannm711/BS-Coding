export const ACCOUNT_POLICIES = ['AUTO', 'PREFERRED', 'PINNED'] as const
export type AccountPolicy = typeof ACCOUNT_POLICIES[number]

export const CAPABILITY_HEALTH = ['VERIFIED', 'DEGRADED', 'UNSUPPORTED', 'UNKNOWN'] as const
export type CapabilityHealth = typeof CAPABILITY_HEALTH[number]

export interface ModelCapabilities {
  streaming: CapabilityHealth
  structuredTools: CapabilityHealth
  parallelTools: CapabilityHealth
  toolChoice: CapabilityHealth
  reasoning: CapabilityHealth
  images: CapabilityHealth
  structuredOutput: CapabilityHealth
  nativeResume: CapabilityHealth
  contextWindow?: number
}

export interface ProviderSummary {
  id: string
  name: string
  enabled: boolean
}

export interface ProviderAccountSummary {
  id: string
  providerId: string
  enabled: boolean
  status: 'HEALTHY' | 'COOLDOWN' | 'EXPIRED' | 'ERROR' | 'UNKNOWN'
}

export interface RuntimeTarget {
  providerId: string
  accountId: string
  modelId: string
  capabilities: Pick<ModelCapabilities, 'structuredTools'>
}

export interface RuntimeTargetCandidateSummary {
  id: string
  providerName: string
  accountLabel: string
  modelName: string
  accountStatus: ProviderAccountSummary['status']
  selectable: boolean
  unavailableReason?: string
  target: RuntimeTarget
}
