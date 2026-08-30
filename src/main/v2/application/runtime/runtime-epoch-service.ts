import type { RuntimeTarget } from '../../../../shared/v2/contracts/provider'

export interface EpochRecord {
  id: string; workSessionId: string; agentRunId: string
  status: 'STARTING' | 'ACTIVE' | 'CLOSING' | 'CLOSED'
  target: RuntimeTarget | { providerId: string; accountId: string; modelId: string }
  reason?: string; startedAt?: string; endedAt?: string; endReason?: string
}

interface EpochDependencies {
  findActive(agentRunId: string): Promise<EpochRecord | null>
  save(epoch: EpochRecord): Promise<void>
  appendLifecycle(event: { type: 'RUNTIME_EPOCH_CLOSED' | 'RUNTIME_EPOCH_STARTED'; epochId: string;
    workSessionId: string; agentRunId: string }): Promise<void>
  nextId(): string
  now(): string
  transaction<T>(operation: () => Promise<T>): Promise<T>
}

export function createRuntimeEpochService(deps: EpochDependencies) {
  return {
    async switchRuntime(input: { workSessionId: string; agentRunId: string; target: RuntimeTarget |
      { providerId: string; accountId: string; modelId: string }; reason: string }) {
      return deps.transaction(async () => {
        const active = await deps.findActive(input.agentRunId)
        if (!active || active.status !== 'ACTIVE') throw new Error('active RuntimeEpoch is required')
        if (active.workSessionId !== input.workSessionId) {
          throw new Error('active RuntimeEpoch belongs to a different WorkSession')
        }
        const timestamp = deps.now()
        await deps.save({ ...active, status: 'CLOSED', endedAt: timestamp, endReason: input.reason })
        await deps.appendLifecycle({ type: 'RUNTIME_EPOCH_CLOSED', epochId: active.id,
          workSessionId: input.workSessionId, agentRunId: input.agentRunId })
        const next: EpochRecord = { id: deps.nextId(), workSessionId: input.workSessionId,
          agentRunId: input.agentRunId, status: 'ACTIVE', target: structuredClone(input.target),
          reason: input.reason, startedAt: timestamp }
        await deps.save(next)
        await deps.appendLifecycle({ type: 'RUNTIME_EPOCH_STARTED', epochId: next.id,
          workSessionId: input.workSessionId, agentRunId: input.agentRunId })
        return { epochId: next.id, workSessionId: next.workSessionId, agentRunId: next.agentRunId }
      })
    }
  }
}
