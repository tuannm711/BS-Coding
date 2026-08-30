import { expect, it } from 'vitest'
import { createBottomPanelProjectionService } from '../../../src/main/v2/application/projections/bottom-panel-projections'

it('keeps bottom tabs on declared sources and enforces the request limit', async () => {
  const service = createBottomPanelProjectionService({ revision: async () => 2,
    terminals: async () => [{ id: 'pty', title: 'Shell', status: 'RUNNING' }],
    tests: async () => [{ id: 'test', status: 'PASS', artifactId: 'test-artifact' }],
    problems: async () => [{ id: 'problem', kind: 'LSP_DIAGNOSTIC', severity: 'ERROR', message: 'x', evidenceRefs: [] }],
    logs: async (_p, _w, limit) => Array.from({ length: limit + 2 }, (_, index) => ({ id: `log-${index}`, occurredAt: '2026-08-30T00:00:00.000Z', level: 'INFO', message: 'safe' })),
    output: async () => [] })
  const panel = await service.get('p1', 'wf1', 2)
  expect(panel.tests).toMatchObject({ status: 'AVAILABLE', value: [{ artifactId: 'test-artifact' }] })
  expect(panel.problems).toMatchObject({ status: 'AVAILABLE', value: [{ kind: 'LSP_DIAGNOSTIC' }] })
  expect(panel.logs.status === 'AVAILABLE' && panel.logs.value).toHaveLength(2)
})
