import type { CanonicalEvent } from '../../../../shared/v2/contracts/events'

export function selectContextEvents(
  events: readonly (CanonicalEvent & Record<string, unknown>)[],
  correlation: { taskRunId: string; agentRunId: string }
): CanonicalEvent[] {
  return events
    .filter(event => event.taskRunId === correlation.taskRunId && event.agentRunId === correlation.agentRunId)
    .map(event => {
      const { providerConversationId: _providerConversationId,
        thoughtSignature: _thoughtSignature, nativeSessionId: _nativeSessionId,
        runtimeContext: _runtimeContext, ...canonical } = event
      return canonical as CanonicalEvent
    })
}
