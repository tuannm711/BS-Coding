import type { WorkspaceMergeOutcome } from '../../../../shared/v2/contracts/workspace'

export interface IntegrationCandidate {
  taskId: string
  branch: string
  approved: boolean
}

export class IntegrationService {
  constructor(private readonly deps: {
    merge(branch: string): Promise<WorkspaceMergeOutcome>
    createConflictTask(input: { taskId: string; branch: string; files: string[] }): Promise<void>
    requestQualityGateRerun(taskIds: readonly string[]): Promise<void>
  }) {}

  async integrate(candidates: readonly IntegrationCandidate[]): Promise<WorkspaceMergeOutcome> {
    const approved = [...candidates]
      .filter(candidate => candidate.approved)
      .sort((left, right) => left.taskId.localeCompare(right.taskId))
    let lastCommit = ''
    for (const candidate of approved) {
      const outcome = await this.deps.merge(candidate.branch)
      if (outcome.kind === 'CONFLICT') {
        await this.deps.createConflictTask({ taskId: candidate.taskId,
          branch: candidate.branch, files: [...outcome.files] })
        return { kind: 'CONFLICT', files: [...outcome.files] }
      }
      lastCommit = outcome.commit
    }
    if (approved.length > 0) {
      await this.deps.requestQualityGateRerun(approved.map(candidate => candidate.taskId))
    }
    return { kind: 'MERGED', commit: lastCommit }
  }
}
