interface LegacyRemoteStatusEdge {
  getStatus(): { enabled: boolean; connected: boolean; paired: boolean; error?: string }
}

// Delete at P20 after the remote relay lifecycle is composed entirely by V2.
export class V1RemoteStatusAdapter {
  constructor(private readonly legacy: LegacyRemoteStatusEdge) {}

  async get(): Promise<{ enabled: boolean; status: string }> {
    const state = this.legacy.getStatus()
    const status = state.error ? 'ERROR' : !state.enabled ? 'DISABLED'
      : state.connected && state.paired ? 'CONNECTED' : state.connected ? 'PAIRING' : 'OFFLINE'
    return { enabled: state.enabled, status }
  }
}
