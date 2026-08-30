export type CommandReservation =
  | { status: 'RESERVED' }
  | { status: 'IN_PROGRESS' }
  | { status: 'COMPLETED'; result: unknown }

export interface CommandIdempotencyPort {
  reserve(requestId: string, commandName: string): Promise<CommandReservation>
  complete(requestId: string, commandName: string, result: unknown): Promise<void>
  release(requestId: string, commandName: string): Promise<void>
}
