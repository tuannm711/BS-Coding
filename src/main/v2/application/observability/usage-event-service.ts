import type { CanonicalEvent } from '../../../../shared/v2/contracts/events'
import type { UsageEventPayload, UsageRecord } from '../../../../shared/v2/contracts/usage'
import { CanonicalEventSchema } from '../../../../shared/v2/schemas/canonical-event'
import type { EventStore } from '../ports/event-store'
import type { UsageLedger } from './usage-ledger'
import type { AgentRunUsageRecord } from '../ports/agent-run-executor'

export function createUsageEventService(deps: {
  events: EventStore
  ledger: UsageLedger
  transaction<T>(operation: () => Promise<T>): Promise<T>
}) {
  return { record(input: CanonicalEvent<UsageEventPayload>): Promise<boolean> {
    const event = CanonicalEventSchema.parse(input) as CanonicalEvent<UsageEventPayload>
    if (event.type !== 'USAGE') throw new Error('USAGE event is required')
    return deps.transaction(async () => {
      if (await deps.ledger.has(event.id)) return false
      const aggregateId = event.workflowRunId ?? event.workSessionId ?? event.agentRunId ?? event.projectId
      const expected = await deps.events.latestSequence(aggregateId)
      const { sequence: _sequence, ...toAppend } = event
      await deps.events.append(aggregateId, expected, [toAppend])
      const record: UsageRecord = { id: event.id, projectId: event.projectId,
        workSessionId: event.workSessionId, workflowRunId: event.workflowRunId,
        taskRunId: event.taskRunId, agentRunId: event.agentRunId,
        providerId: event.payload.providerId, accountId: event.payload.accountId,
        modelId: event.payload.modelId, requests: event.payload.requests,
        inputTokens: event.payload.inputTokens, outputTokens: event.payload.outputTokens,
        cacheReadTokens: event.payload.cacheReadTokens, cacheWriteTokens: event.payload.cacheWriteTokens,
        costUsd: event.payload.costUsd, occurredAt: event.timestamp }
      await deps.ledger.record(record)
      return true
    })
  } }
}

export function createAgentRunUsageRecorder(deps: {
  service: ReturnType<typeof createUsageEventService>
  nextId(): string
  now(): string
}) {
  return async (usage: AgentRunUsageRecord): Promise<void> => {
    await deps.service.record({ id: deps.nextId(), type: 'USAGE', schemaVersion: 1, sequence: 0,
      timestamp: deps.now(), projectId: usage.projectId, workSessionId: usage.workSessionId,
      workflowRunId: usage.workflowRunId, taskRunId: usage.taskRunId, agentRunId: usage.agentRunId,
      runtimeEpochId: usage.runtimeEpochId, correlationId: usage.correlationId,
      payload: { providerId: usage.providerId, accountId: usage.accountId, modelId: usage.modelId,
        requests: usage.requests, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens,
        costUsd: usage.costUsd } })
  }
}
