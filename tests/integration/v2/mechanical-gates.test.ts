import { describe, expect, it } from 'vitest'
import { runMechanicalGate } from '../../../src/main/v2/application/review/mechanical-gates'
import { CommandRunner } from '../../../src/main/v2/infrastructure/processes/command-runner'

describe('mechanical quality gates', () => {
  it('uses process exit code rather than command prose', async () => {
    const artifacts: unknown[] = []
    const failed = await runMechanicalGate({ id: 'g1', scope: 'workflow', blocking: true,
      command: process.execPath, args: ['-e', 'console.log("PASS"); process.exit(1)'] },
    { runner: new CommandRunner(), saveArtifact: async artifact => { artifacts.push(artifact); return 'log-1' } })
    expect(failed).toMatchObject({ status: 'FAIL', exitCode: 1, artifactRefs: ['log-1'] })
    expect(artifacts[0]).toMatchObject({ stdout: 'PASS' })

    const passed = await runMechanicalGate({ id: 'g2', scope: 'workflow', blocking: true,
      command: process.execPath, args: ['-e', 'console.log("FAIL"); process.exit(0)'] },
    { runner: new CommandRunner(), saveArtifact: async () => 'log-2' })
    expect(passed.status).toBe('PASS')
  })

  it('captures stderr and duration without invoking a shell', async () => {
    const result = await new CommandRunner().run(process.execPath,
      ['-e', 'console.error("problem"); process.exit(2)'])
    expect(result).toMatchObject({ exitCode: 2, stderr: 'problem' })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})
