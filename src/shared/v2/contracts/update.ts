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

export interface UpdateSnapshot extends UpdateStatus {
  channel: UpdateChannel
}
