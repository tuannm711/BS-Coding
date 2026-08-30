import type { ProviderAccountSummary } from '../../../../shared/v2/contracts/provider'
import type {
  GitSummary, McpServerSummary, ProblemSummary, ProjectionSection, SkillBindingSummary,
  WorkspaceSummary
} from '../../../../shared/v2/contracts/ui-projections'

export interface ProjectionSupportPort {
  getWorkspace(projectId: string): Promise<ProjectionSection<WorkspaceSummary>>
  getGitStatus(projectId: string): Promise<ProjectionSection<GitSummary>>
  listProviderAccounts(): Promise<readonly ProviderAccountSummary[]>
  listSkillBindings(projectId: string): Promise<ProjectionSection<readonly SkillBindingSummary[]>>
  listMcpServers(projectId: string): Promise<ProjectionSection<readonly McpServerSummary[]>>
  listDiagnostics(projectId: string,
    workflowRunId?: string): Promise<ProjectionSection<readonly ProblemSummary[]>>
}
