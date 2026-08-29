import type { EventToAppend } from '../../application/ports/event-store'
import type { Clock } from '../../application/ports/clock'
import type { IdGenerator } from '../../application/ports/id-generator'
import type { CanonicalEventType } from '../../../../shared/v2/contracts/events'
import { CanonicalEventSchema } from '../../../../shared/v2/schemas/canonical-event'
import { redactEventPayload } from './event-redaction'

export interface EventFactoryInput {
  type: CanonicalEventType
  projectId: string
  workSessionId?: string
  workflowRunId?: string
  taskRunId?: string
  agentRunId?: string
  runtimeEpochId?: string
  causationId?: string
  correlationId: string
  payload: unknown
}

export function createEventFactory(deps: { clock: Clock; ids: IdGenerator }) {
  return {
    create(input: EventFactoryInput): EventToAppend {
      if (!input.projectId || !input.correlationId) {
        throw new Error('canonical correlation requires projectId and correlationId')
      }
      const candidate = {
        ...input, id: deps.ids.next(), schemaVersion: 1 as const,
        sequence: 0, timestamp: deps.clock.now(), payload: redactEventPayload(input.payload)
      }
      const parsed = CanonicalEventSchema.parse(candidate)
      const { sequence: _sequence, ...event } = parsed
      return event as EventToAppend
    }
  }
}
