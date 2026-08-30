import type { CanonicalEvent } from '../../../../shared/v2/contracts/events'
import type {
  DiagnosticCorrelation, DiagnosticEntry
} from '../../../../shared/v2/contracts/diagnostics'
import { redactObject } from '../security/redaction-service'

export function createDiagnosticEntry(input: Omit<DiagnosticEntry, 'id'> & { id?: string }): DiagnosticEntry {
  return { id: input.id ?? `${input.correlation.correlationId}:${input.code}:${input.timestamp}`,
    timestamp: input.timestamp, level: input.level, code: input.code,
    message: input.message, correlation: { ...input.correlation } }
}

function correlation(event: CanonicalEvent): DiagnosticCorrelation {
  return { projectId: event.projectId, workSessionId: event.workSessionId,
    workflowRunId: event.workflowRunId, taskRunId: event.taskRunId, agentRunId: event.agentRunId,
    runtimeEpochId: event.runtimeEpochId, correlationId: event.correlationId }
}

function level(event: CanonicalEvent): DiagnosticEntry['level'] {
  if (event.type === 'ERROR') return 'ERROR'
  if (event.type === 'FINDING') return 'WARN'
  return 'INFO'
}

function code(event: CanonicalEvent): string {
  const payload = event.payload as Record<string, unknown>
  const kind = typeof payload.kind === 'string' ? payload.kind : undefined
  return kind ?? event.type
}

function message(event: CanonicalEvent, knownValues: readonly string[]): string {
  const payload = event.payload as Record<string, unknown>
  const raw = [payload.message, payload.title, payload.text, payload.kind]
    .find(value => typeof value === 'string')
  return redactObject({ message: typeof raw === 'string' ? raw : event.type },
    { knownValues }).message
}

export function diagnosticFromEvent(event: CanonicalEvent,
  knownValues: readonly string[] = []): DiagnosticEntry {
  return createDiagnosticEntry({ id: event.id, timestamp: event.timestamp, level: level(event),
    code: code(event), message: message(event, knownValues), correlation: correlation(event) })
}

export function createDiagnosticsService(options: { knownValues?: readonly string[] } = {}) {
  return { project(events: readonly CanonicalEvent[]): DiagnosticEntry[] {
    return events.map(event => diagnosticFromEvent(event, options.knownValues))
  } }
}
