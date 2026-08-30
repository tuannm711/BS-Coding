import type { CommandIdempotencyPort } from '../ports/command-idempotency-port'

export class CommandInProgressError extends Error {
  readonly code = 'COMMAND_IN_PROGRESS'
  constructor(requestId: string, commandName: string) {
    super(`command ${commandName} request ${requestId} is already in progress`)
    this.name = 'CommandInProgressError'
  }
}

export async function runIdempotentCommand<T>(deps: {
  idempotency: CommandIdempotencyPort
  transaction<R>(operation: () => Promise<R>): Promise<R>
}, requestId: string, commandName: string, operation: () => Promise<T>): Promise<T> {
  return deps.transaction(async () => {
    const reservation = await deps.idempotency.reserve(requestId, commandName)
    if (reservation.status === 'COMPLETED') return reservation.result as T
    if (reservation.status === 'IN_PROGRESS') {
      throw new CommandInProgressError(requestId, commandName)
    }
    try {
      const result = await operation()
      await deps.idempotency.complete(requestId, commandName, result)
      return result
    } catch (error) {
      await deps.idempotency.release(requestId, commandName)
      throw error
    }
  })
}
