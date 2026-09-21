import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UpdaterStatusEvent } from '../../src/shared/types'
import type { UpdaterEnv } from '../../src/main/updater'
import {
  Updater,
  parseMajor,
  compareSemver,
  parseReleaseTagsFromAtomFeed,
  discoverLatestMatchingRelease
} from '../../src/main/updater'

const { mockAutoUpdater, listeners } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  return {
    listeners,
    mockAutoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: vi.fn(),
      setFeedURL: vi.fn(),
      downloadUpdate: vi.fn(() => Promise.resolve()),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners.set(event, cb)
      }),
      quitAndInstall: vi.fn()
    }
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}))

const sampleFeedXml = `
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.1"/><title>v2.0.1</title></entry>
  <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v1.4.1"/><title>v1.4.1</title></entry>
  <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.0"/><title>v2.0.0</title></entry>
  <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v1.3.3"/><title>v1.3.3</title></entry>
</feed>
`

function makeEnv(overrides: Partial<UpdaterEnv> = {}): UpdaterEnv {
  return {
    isPackaged: true,
    isPortable: () => false,
    isAppImage: () => false,
    getCurrentVersion: () => '1.3.2',
    platform: 'win32',
    ...overrides
  }
}

function makeUpdater(env: UpdaterEnv = makeEnv()) {
  const events: UpdaterStatusEvent[] = []
  const updater = new Updater(e => events.push(e), env)
  return { events, updater }
}

describe('Semver & Major utilities', () => {
  it('parseMajor extracts major version correctly', () => {
    expect(parseMajor('1.3.2')).toBe(1)
    expect(parseMajor('v2.0.1')).toBe(2)
    expect(parseMajor('v1.4.0-alpha')).toBe(1)
    expect(Number.isNaN(parseMajor('invalid'))).toBe(true)
  })

  it('compareSemver correctly compares versions', () => {
    expect(compareSemver('1.3.3', '1.3.2')).toBeGreaterThan(0)
    expect(compareSemver('1.3.2', '1.3.3')).toBeLessThan(0)
    expect(compareSemver('1.4.0', '1.3.3')).toBeGreaterThan(0)
    expect(compareSemver('1.3.2', '1.3.2')).toBe(0)
  })

  it('parseReleaseTagsFromAtomFeed extracts tags matching target major', () => {
    const v1Tags = parseReleaseTagsFromAtomFeed(sampleFeedXml, 1)
    expect(v1Tags).toEqual([
      { tag: 'v1.4.1', version: '1.4.1' },
      { tag: 'v1.3.3', version: '1.3.3' }
    ])

    const v2Tags = parseReleaseTagsFromAtomFeed(sampleFeedXml, 2)
    expect(v2Tags).toEqual([
      { tag: 'v2.0.1', version: '2.0.1' },
      { tag: 'v2.0.0', version: '2.0.0' }
    ])
  })
})

describe('Update Discovery Isolation (Layer 1)', () => {
  it('T1/T2: Installed 1.3.2 discovers v1.4.1 (highest V1 release) ignoring V2 releases in feed', async () => {
    const fetchFeed = vi.fn().mockResolvedValue(sampleFeedXml)
    const discovered = await discoverLatestMatchingRelease('1.3.2', fetchFeed)
    expect(discovered).toEqual({ targetTag: 'v1.4.1', targetVersion: '1.4.1' })
  })

  it('T1: Installed 1.3.2 discovers v1.3.3 when v1.3.3 is the latest V1 release', async () => {
    const feedXml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.0"/><title>v2.0.0</title></entry>
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v1.3.3"/><title>v1.3.3</title></entry>
      </feed>
    `
    const fetchFeed = vi.fn().mockResolvedValue(feedXml)
    const discovered = await discoverLatestMatchingRelease('1.3.2', fetchFeed)
    expect(discovered).toEqual({ targetTag: 'v1.3.3', targetVersion: '1.3.3' })
  })

  it('T3: Installed 1.4.0 with only V2 releases in feed returns null (no V1 update)', async () => {
    const v2OnlyFeed = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.1"/><title>v2.0.1</title></entry>
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.0"/><title>v2.0.0</title></entry>
      </feed>
    `
    const fetchFeed = vi.fn().mockResolvedValue(v2OnlyFeed)
    const discovered = await discoverLatestMatchingRelease('1.4.0', fetchFeed)
    expect(discovered).toBeNull()
  })
})

describe('Updater with Discovery & Major Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners.clear()
    mockAutoUpdater.autoDownload = true
    mockAutoUpdater.autoInstallOnAppQuit = true
  })

  it('dev mode: manual check emits not-supported, auto check stays silent', async () => {
    const { events, updater } = makeUpdater(makeEnv({ isPackaged: false }))
    await updater.check(true)
    expect(events).toEqual([{ type: 'not-supported', message: expect.any(String) }])
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()

    events.length = 0
    await updater.check(false)
    expect(events).toEqual([])
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('portable build: manual check emits not-supported', async () => {
    const { events, updater } = makeUpdater(makeEnv({ isPortable: () => true }))
    await updater.check(true)
    expect(events).toEqual([{ type: 'not-supported', message: expect.any(String) }])
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('linux without AppImage: manual check emits not-supported', async () => {
    const { events, updater } = makeUpdater(makeEnv({ platform: 'linux', isAppImage: () => false }))
    await updater.check(true)
    expect(events).toEqual([{ type: 'not-supported', message: expect.any(String) }])
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('linux with AppImage is supported', async () => {
    const { events, updater } = makeUpdater(makeEnv({ platform: 'linux', isAppImage: () => true }))
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.3.2', releaseDate: '2026-08-18T00:00:00.000Z' }
    })
    await updater.check(true)
    expect(events).toEqual([{ type: 'checking' }, { type: 'up-to-date', currentVersion: '1.3.2' }])
  })

  it('T2: V1 1.3.2 discovers v1.3.3 via feed even when GitHub latest is v2.0.0', async () => {
    const fetchFeed = vi.fn().mockResolvedValue(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.0"/><title>v2.0.0</title></entry>
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v1.3.3"/><title>v1.3.3</title></entry>
      </feed>
    `)
    const { events, updater } = makeUpdater(makeEnv({ getCurrentVersion: () => '1.3.2', fetchFeed }))
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.3.3', releaseDate: '2026-08-18T00:00:00.000Z' }
    })

    await updater.check(true)
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://github.com/tuannm711/BS-Coding/releases/download/v1.3.3'
    })
    expect(events).toEqual([
      { type: 'checking' },
      {
        type: 'update-available',
        version: '1.3.3',
        currentVersion: '1.3.2',
        releaseNotes: undefined,
        releaseDate: '2026-08-18T00:00:00.000Z'
      }
    ])
  })

  it('T3: V1 1.4.0 with only V2 releases in feed emits up-to-date', async () => {
    const fetchFeed = vi.fn().mockResolvedValue(`
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.1"/><title>v2.0.1</title></entry>
        <entry><link href="https://github.com/tuannm711/BS-Coding/releases/tag/v2.0.0"/><title>v2.0.0</title></entry>
      </feed>
    `)
    const { events, updater } = makeUpdater(makeEnv({ getCurrentVersion: () => '1.4.0', fetchFeed }))
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.4.0', releaseDate: '2026-08-18T00:00:00.000Z' }
    })

    await updater.check(true)
    expect(events).toEqual([{ type: 'checking' }, { type: 'up-to-date', currentVersion: '1.4.0' }])
  })

  it('T6: Layer 2 Major Guard rejects cross-major update if returned by autoUpdater', async () => {
    const { events, updater } = makeUpdater(makeEnv({ getCurrentVersion: () => '1.3.2' }))
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '2.0.0', releaseDate: '2026-08-18T00:00:00.000Z' }
    })
    await updater.check(true)
    expect(events).toEqual([{ type: 'checking' }, { type: 'up-to-date', currentVersion: '1.3.2' }])
  })

  it('forwards download-progress with a rounded percent', async () => {
    const { events } = makeUpdater()
    const emit = listeners.get('download-progress')!
    emit({ percent: 45.6, total: 100, transferred: 45.6, delta: 0, bytesPerSecond: 0 })
    expect(events).toEqual([{ type: 'download-progress', percent: 46 }])
  })

  it('forwards update-downloaded as downloaded with the new version', async () => {
    const { events } = makeUpdater()
    const emit = listeners.get('update-downloaded')!
    emit({ version: '1.3.3', downloadedFile: '/tmp/update' })
    expect(events).toEqual([{ type: 'downloaded', version: '1.3.3' }])
  })

  it('install after update-downloaded quits and installs', async () => {
    const { updater } = makeUpdater()
    const emit = listeners.get('update-downloaded')!
    emit({ version: '1.3.3', downloadedFile: '/tmp/update' })
    updater.install()
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
