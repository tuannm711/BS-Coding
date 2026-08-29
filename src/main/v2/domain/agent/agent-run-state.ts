import type { AgentRunStatus } from '../../../../shared/v2/contracts/domain'

export interface AgentRunState {
  status: AgentRunStatus
}

export type AgentRunEvent =
  | { type: 'START' }
  | { type: 'STARTED' }
  | { type: 'SUCCEED' }
  | { type: 'FAIL' }
  | { type: 'BLOCK' }
  | { type: 'CANCEL' }
  | { type: 'DEGRADE' }

const transitions: Partial<
  Record<AgentRunStatus, Partial<Record<AgentRunEvent['type'], AgentRunStatus>>>
> = {
  CREATED: { START: 'STARTING', CANCEL: 'CANCELLED' },
  STARTING: {
    STARTED: 'RUNNING',
    FAIL: 'FAILED',
    BLOCK: 'BLOCKED',
    CANCEL: 'CANCELLED',
    DEGRADE: 'DEGRADED'
  },
  RUNNING: {
    SUCCEED: 'SUCCEEDED',
    FAIL: 'FAILED',
    BLOCK: 'BLOCKED',
    CANCEL: 'CANCELLED',
    DEGRADE: 'DEGRADED'
  }
}

const terminalStatuses = new Set<AgentRunStatus>([
  'SUCCEEDED', 'FAILED', 'BLOCKED', 'CANCELLED', 'DEGRADED'
])

export function transitionAgentRun(run: AgentRunState, event: AgentRunEvent): AgentRunState {
  if (terminalStatuses.has(run.status)) {
    throw new Error(`terminal AgentRun ${run.status} cannot transition`)
  }

  const next = transitions[run.status]?.[event.type]
  if (!next) throw new Error(`illegal AgentRun transition: ${run.status} + ${event.type}`)
  return { ...run, status: next }
}
