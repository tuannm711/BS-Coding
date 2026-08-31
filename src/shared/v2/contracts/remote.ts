export type RemoteConnectionState =
  | 'DISABLED' | 'OFFLINE' | 'CONNECTING' | 'PAIRING' | 'CONNECTED' | 'ERROR'

export interface RemoteDeviceSummary {
  id: string
  name: string
  status: 'ONLINE' | 'OFFLINE'
  pairedAt?: string
  lastSeenAt?: string
}

export interface PairingStatus {
  enabled: boolean
  state: RemoteConnectionState
  code?: string
  expiresAt?: string
  relayUrl?: string
  devices: readonly RemoteDeviceSummary[]
  message?: string
}

export type RemoteAuditEvent =
  | { type: 'CONNECTION'; state: RemoteConnectionState; deviceId?: string; timestamp: string }
  | { type: 'PRIVILEGED_COMMAND'; command: string; deviceId?: string; timestamp: string }
