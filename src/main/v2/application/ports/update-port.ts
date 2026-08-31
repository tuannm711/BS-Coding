import type { UpdateChannel, UpdateSnapshot } from '../../../../shared/v2/contracts/update'

export interface UpdatePort {
  getStatus(): UpdateSnapshot
  setChannel(channel: UpdateChannel): void
  check(): Promise<void>
  download(): void
  apply(): void
  subscribe(listener: (status: UpdateSnapshot) => void): () => void
}
