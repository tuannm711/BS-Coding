import type { PairingStatus } from '../../../../shared/v2/contracts/remote'

export interface RemoteControlPort {
  getStatus(): Promise<PairingStatus>
  setRelayUrl(url: string): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  startPairing(): Promise<PairingStatus>
  revokeDevice(deviceId: string): Promise<void>
  subscribe(listener: (status: PairingStatus) => void): () => void
}
