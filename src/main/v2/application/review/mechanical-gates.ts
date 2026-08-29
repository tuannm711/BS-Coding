import type { QualityGate } from '../../../../shared/v2/contracts/review'
import type { CommandExecutionPort } from '../ports/command-runner'

export interface MechanicalGateInput {
  id: string
  scope: string
  blocking: boolean
  command: string
  args: readonly string[]
  cwd?: string
}

export async function runMechanicalGate(
  input: MechanicalGateInput,
  deps: {
    runner: CommandExecutionPort
    saveArtifact(artifact: { command: string; args: readonly string[]; stdout: string;
      stderr: string; exitCode: number }): Promise<string>
  }
): Promise<QualityGate> {
  const result = await deps.runner.run(input.command, input.args, input.cwd)
  const artifactId = await deps.saveArtifact({
    command: input.command,
    args: [...input.args],
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode
  })
  return {
    id: input.id,
    scope: input.scope,
    kind: 'MECHANICAL',
    blocking: input.blocking,
    status: result.exitCode === 0 ? 'PASS' : 'FAIL',
    command: [input.command, ...input.args].join(' '),
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    artifactRefs: [artifactId]
  }
}
