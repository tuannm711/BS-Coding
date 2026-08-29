import type { WorkspaceMergeOutcome } from '../../../../shared/v2/contracts/workspace'
import { runGit } from './git-command'

export class GitIntegrationAdapter {
  constructor(
    private readonly integrationWorktreePath: string,
    private readonly git: (cwd: string, args: readonly string[]) => Promise<string> = runGit
  ) {}

  async merge(branch: string): Promise<WorkspaceMergeOutcome> {
    try {
      await this.git(this.integrationWorktreePath, ['merge', '--no-ff', '--no-edit', branch])
      return { kind: 'MERGED', commit: await this.git(this.integrationWorktreePath, ['rev-parse', 'HEAD']) }
    } catch (error) {
      const output = await this.git(this.integrationWorktreePath,
        ['diff', '--name-only', '--diff-filter=U'])
      if (!output) throw error
      return { kind: 'CONFLICT', files: output.split(/\r?\n/) }
    }
  }
}
