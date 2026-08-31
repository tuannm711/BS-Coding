import { describe, expect, it } from 'vitest'
import { V1UpdaterAdapter, mapUpdaterStatus } from '../../../src/main/v2/infrastructure/updates/v1-updater-adapter'

describe('V1 updater adapter', () => {
  it('maps legacy updater progress and release metadata to V2 status', () => {
    expect(mapUpdaterStatus({ type: 'download-progress', percent: 42 })).toEqual({
      state: 'DOWNLOADING', progress: 42
    })
    expect(mapUpdaterStatus({
      type: 'update-available', version: '2.0.1', currentVersion: '2.0.0',
      releaseNotes: 'Fixes', releaseDate: '2026-09-01T00:00:00.000Z'
    })).toEqual({
      state: 'AVAILABLE', version: '2.0.1', currentVersion: '2.0.0',
      releaseNotes: 'Fixes', releaseDate: '2026-09-01T00:00:00.000Z'
    })
  })

  it('delegates commands and stops status delivery after unsubscribe', async () => {
    const calls: string[] = []
    const adapter = new V1UpdaterAdapter({
      check: async manual => { calls.push(`check:${manual}`) },
      install: () => { calls.push('install') },
      setChannel: channel => { calls.push(`channel:${channel}`) }
    })
    adapter.setChannel('BETA')
    const statuses: unknown[] = []
    const unsubscribe = adapter.subscribe(status => statuses.push(status))

    adapter.accept({ type: 'checking' })
    await adapter.check()
    adapter.download()
    adapter.apply()
    unsubscribe()
    adapter.accept({ type: 'downloaded', version: '2.0.1' })

    expect(calls).toEqual(['channel:beta', 'check:true', 'install', 'install'])
    expect(statuses).toEqual([{ state: 'CHECKING', channel: 'BETA' }])
    expect(adapter.getStatus()).toEqual({ state: 'READY', channel: 'BETA', version: '2.0.1' })
  })
})
