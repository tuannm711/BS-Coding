import type { RuntimeEpochStatus } from '../../../../shared/v2/contracts/domain'

export interface RuntimeEpochState {
  status: RuntimeEpochStatus
}

export type RuntimeEpochEvent =
  | { type: 'ACTIVATE' }
  | { type: 'BEGIN_CLOSE' }
  | { type: 'INTERRUPT' }
  | { type: 'FINISH_CLOSE' }

const transitions: Record<
  Exclude<RuntimeEpochStatus, 'CLOSED'>,
  Partial<Record<RuntimeEpochEvent['type'], RuntimeEpochStatus>>
> = {
  STARTING: { ACTIVATE: 'ACTIVE', INTERRUPT: 'CLOSING' },
  ACTIVE: { BEGIN_CLOSE: 'CLOSING', INTERRUPT: 'CLOSING' },
  CLOSING: { FINISH_CLOSE: 'CLOSED' }
}

export function transitionRuntimeEpoch(
  epoch: RuntimeEpochState,
  event: RuntimeEpochEvent
): RuntimeEpochState {
  if (epoch.status === 'CLOSED') throw new Error('terminal RuntimeEpoch cannot transition')

  const next = transitions[epoch.status][event.type]
  if (!next) throw new Error(`illegal RuntimeEpoch transition: ${epoch.status} + ${event.type}`)
  return { ...epoch, status: next }
}
