import { expect, it } from 'vitest'
import {
  createDiagnosticEntry, diagnosticFromEvent
} from '../../../src/main/v2/application/observability/diagnostics-service'
import { DiagnosticEntrySchema } from '../../../src/shared/v2/schemas/diagnostics'

it('includes correlation IDs and redacts diagnostic messages', () => {
  const entry = createDiagnosticEntry({ timestamp: '2026-08-30T00:00:00.000Z', level: 'INFO',
    code: 'RUNTIME_SWITCH', message: 'switched', correlation: {
      projectId: 'p1', workSessionId: 'ws1', runtimeEpochId: 'epoch-2', correlationId: 'corr-1'
    } })
  expect(DiagnosticEntrySchema.parse(entry).correlation)
    .toMatchObject({ workSessionId: 'ws1', runtimeEpochId: 'epoch-2' })

  const diagnostic = diagnosticFromEvent({ id: 'event-1', type: 'ERROR', schemaVersion: 1,
    sequence: 1, timestamp: '2026-08-30T00:00:00.000Z', projectId: 'p1',
    workSessionId: 'ws1', correlationId: 'corr-1', payload: {
      message: 'failed apiKey=secret-value', apiKey: 'secret-value'
    } }, ['secret-value'])
  expect(diagnostic.message).not.toContain('secret-value')
  expect(JSON.stringify(diagnostic)).not.toContain('apiKey')
})
