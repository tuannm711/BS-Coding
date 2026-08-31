import type { UpdaterStatusEvent } from '../../../../shared/types'
import type { UpdateChannel, UpdatePort, UpdateStatus } from '../../application/ports/update-port'

interface LegacyUpdaterEdge {
  check(manual: boolean): Promise<void>
  install(): void
  setChannel(channel: 'stable' | 'beta'): void
}

export function mapUpdaterStatus(status: UpdaterStatusEvent): UpdateStatus {
  switch (status.type) {
    case 'checking': return { state: 'CHECKING' }
    case 'update-available': return {
      state: 'AVAILABLE', version: status.version, currentVersion: status.currentVersion,
      ...(status.releaseNotes ? { releaseNotes: status.releaseNotes } : {}),
      ...(status.releaseDate ? { releaseDate: status.releaseDate } : {})
    }
    case 'up-to-date': return { state: 'IDLE', currentVersion: status.currentVersion }
    case 'download-progress': return { state: 'DOWNLOADING', progress: status.percent }
    case 'downloaded': return { state: 'READY', version: status.version }
    case 'error': return { state: 'ERROR', message: status.message }
    case 'not-supported': return { state: 'ERROR', message: status.message }
  }
}

export class V1UpdaterAdapter implements UpdatePort {
  private readonly listeners = new Set<(status: UpdateStatus) => void>()

  constructor(private readonly legacy: LegacyUpdaterEdge) {}

  setChannel(channel: UpdateChannel): void {
    this.legacy.setChannel(channel === 'STABLE' ? 'stable' : 'beta')
  }
  check(): Promise<void> { return this.legacy.check(true) }
  download(): void { this.legacy.install() }
  apply(): void { this.legacy.install() }

  subscribe(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  accept(status: UpdaterStatusEvent): void {
    const mapped = mapUpdaterStatus(status)
    for (const listener of this.listeners) listener(mapped)
  }
}
