import { expect, it } from 'vitest'
import { ToolProtocolHarness } from '../../fixtures/v2-regression-harness'

it('never executes narrated calls and executes a duplicate structured call at most once', async () => {
  const harness = new ToolProtocolHarness()

  await harness.acceptText('Calling write({"path":"x.ts"})')
  const call = { callId: 'duplicate-call', toolName: 'write', arguments: { path: 'x.ts' } }
  const [first, second] = await Promise.all([
    harness.acceptStructured(call), harness.acceptStructured(call)
  ])

  expect([first, second]).toEqual(expect.arrayContaining(['written:x.ts', 'DUPLICATE_CALL']))
  expect(harness.sideEffects).toBe(1)
  expect(harness.protocolViolations).toEqual(['PROTOCOL_VIOLATION'])
})
