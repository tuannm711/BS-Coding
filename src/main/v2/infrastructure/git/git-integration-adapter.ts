import type { WorkspaceMergeOutcome } from '../../../../shared/v2/contracts/workspace'
import { runGit } from './git-command'

export class GitIntegrationAdapter {
  constructor(private readonly integrationWorktreePath: string) {}

  async merge(branch: string): Promise<WorkspaceMergeOutcome> {
    try {
      await runGit(this.integrationWorktreePath, ['merge', '--no-ff', '--no-edit', branch])
      return { kind: 'MERGED', commit: await runGit(this.integrationWorktreePath, ['rev-parse', 'HEAD']) }
    } catch {
      const output = await runGit(this.integrationWorktreePath,
        ['diff', '--name-only', '--diff-filter=U'])
      return { kind: 'CONFLICT', files: output ? output.split(/\r?\n/) : [] }
    }
  }
}
