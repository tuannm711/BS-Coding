import { afterEach, describe, expect, it } from 'vitest'
import { TestV2Harness } from '../../fixtures/v2-work-session-harness'

const harnesses: TestV2Harness[] = []
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose()
})

describe('V2 Work Session acceptance lifecycle', () => {
  it('completes only after blocking rework is resolved and rerun gates pass', async () => {
    const harness = await TestV2Harness.create()
    harnesses.push(harness)
    const workSessionId = await harness.startOAuthScenario()

    await harness.failSecurityReview(workSessionId, 'missing OAuth state validation')
    expect(await harness.status(workSessionId)).toBe('REWORK')
    await harness.reportWorkerSuccess(workSessionId)
    expect(await harness.status(workSessionId)).toBe('REWORK')

    await harness.completeReworkAndRerunGates(workSessionId)

    expect(await harness.status(workSessionId)).toBe('COMPLETED')
    expect(harness.trace()).toEqual([
      'plan:approved', 'task:implement-auth', 'task:test-auth', 'review:failed',
      'worker:success-rejected', 'rework:persisted', 'rework:worker-completed',
      'gates:rerun-pass', 'review:rerun-pass', 'workflow:completed'
    ])
    expect(harness.gitEvidence()).toMatchObject({
      repoIsGit: true, isolatedWorktreeCount: 2, committedWorktreeCount: 2
    })
  })
})
