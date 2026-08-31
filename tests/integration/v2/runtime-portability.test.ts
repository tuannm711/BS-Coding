import { expect, it } from 'vitest'
import { RuntimePortabilityHarness } from '../../fixtures/v2-regression-harness'

it('switches model after tool history and executes only the structured next call', async () => {
  const harness = await RuntimePortabilityHarness.create()
  try {
    await harness.persistModelAToolTurn()
    const modelBContext = await harness.restartAndProjectForModelB()
    expect(modelBContext).toEqual(expect.arrayContaining([
      { role: 'tool-call', callId: 'call-a', toolName: 'read', arguments: { path: 'a.ts' } },
      expect.objectContaining({ role: 'tool-result', callId: 'call-a' })
    ]))

    await harness.feedModelBText('Calling write({"path":"x.ts"})')
    expect(harness.toolSideEffects('write')).toBe(0)
    await harness.feedModelBToolCall({ callId: 'call-b', toolName: 'write',
      arguments: { path: 'x.ts' } })
    expect(harness.toolSideEffects('write')).toBe(1)
  } finally {
    harness.dispose()
  }
})
