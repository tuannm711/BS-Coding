import { expect, it } from 'vitest'
import { RoutingRegressionHarness } from '../../fixtures/v2-regression-harness'

it('falls back to another account by closing the old epoch while preserving WorkSession', async () => {
  const harness = new RoutingRegressionHarness()
  const first = harness.routeInitial()
  expect(first).toMatchObject({ accountId: 'account-a' })

  const handoff = await harness.refusePoolAndFallback()

  expect(handoff).toMatchObject({
    workSessionId: 'work-1', agentRunId: 'agent-run-1',
    oldEpoch: { id: 'epoch-1', status: 'CLOSED', accountId: 'account-a' },
    newEpoch: { id: 'epoch-2', status: 'ACTIVE', accountId: 'account-b' }
  })
  expect(harness.lifecycleEvents).toEqual(['RUNTIME_EPOCH_CLOSED', 'RUNTIME_EPOCH_STARTED'])
})
