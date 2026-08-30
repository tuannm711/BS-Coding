import type {
  AgentSettingsProjection, AgentSummary, SafeSettingsSummary
} from '../../../../shared/v2/contracts/ui-projections'
import type { ProviderAccountSummary } from '../../../../shared/v2/contracts/provider'

export function createAgentSettingsProjectionService(deps: {
  revision(projectId: string): Promise<number>
  listAgents(projectId: string): Promise<readonly AgentSummary[]>
  listProviderAccounts(): Promise<readonly ProviderAccountSummary[]>
  credentialState(): Promise<SafeSettingsSummary['providerCredentials']>
}) {
  return {
    async get(projectId: string): Promise<AgentSettingsProjection> {
      const [revision, agents, providerAccounts, providerCredentials] = await Promise.all([
        deps.revision(projectId), deps.listAgents(projectId), deps.listProviderAccounts(),
        deps.credentialState()
      ])
      return Object.freeze({ projectId, revision, agents: Object.freeze([...agents]),
        providerAccounts: Object.freeze([...providerAccounts]),
        globalSettings: Object.freeze({ providerCredentials: Object.freeze({ ...providerCredentials }) }) })
    }
  }
}
