export type UpdateState =
  | 'IDLE' | 'CHECKING' | 'AVAILABLE' | 'DOWNLOADING' | 'READY' | 'ERROR'
export type UpdateChannel = 'STABLE' | 'BETA'

export interface UpdateStatus {
  state: UpdateState
  version?: string
  currentVersion?: string
  releaseNotes?: string
  releaseDate?: string
  progress?: number
  message?: string
}

export interface UpdatePort {
  setChannel(channel: UpdateChannel): void
  check(): Promise<void>
  download(): void
  apply(): void
  subscribe(listener: (status: UpdateStatus) => void): () => void
}
