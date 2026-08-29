export type FailureCode =
  | 'RATE_LIMIT' | 'CAPACITY' | 'NETWORK_TRANSIENT'
  | 'PERMISSION_DENIED' | 'INVALID_ARGS' | 'IMPLEMENTATION_FAILED' | string

const transient = new Set<FailureCode>(['RATE_LIMIT', 'CAPACITY', 'NETWORK_TRANSIENT'])

export function retryDecision(code: FailureCode):
  | { retry: true; scope: 'SAME_ATTEMPT_NEW_EPOCH' }
  | { retry: false } {
  return transient.has(code)
    ? { retry: true, scope: 'SAME_ATTEMPT_NEW_EPOCH' }
    : { retry: false }
}

export interface AttemptRef {
  id: string
  taskId: string
  attempt: number
  provenanceTaskRunId?: string
}

export function nextAttempt(
  current: AttemptRef,
  reason: 'RUNTIME_HANDOFF' | 'IMPLEMENTATION_RETRY'
): AttemptRef {
  if (reason === 'RUNTIME_HANDOFF') return { ...current }
  const attempt = current.attempt + 1
  return {
    id: `${current.id}-attempt-${attempt}`,
    taskId: current.taskId,
    attempt,
    provenanceTaskRunId: current.id
  }
}
