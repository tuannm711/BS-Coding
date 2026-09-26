import { autoUpdater } from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import type { UpdaterStatusEvent } from '../shared/types'

export interface UpdaterEnv {
  isPackaged: boolean
  isPortable: () => boolean
  isAppImage: () => boolean
  getCurrentVersion: () => string
  platform?: NodeJS.Platform
  fetchFeed?: (url: string) => Promise<string>
}

// Extract major version from semver string (e.g. "1.3.2" -> 1, "v10.1.0" -> 10).
export function parseMajor(version: string): number {
  const m = /^v?(\d+)/.exec(version)
  return m ? Number(m[1]) : NaN
}

export function parseSemver(v: string): [number, number, number, string] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(v.trim())
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] || '']
}

export function compareSemver(aStr: string, bStr: string): number {
  const a = parseSemver(aStr)
  const b = parseSemver(bStr)
  if (!a || !b) return 0
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return 1
    if (a[i] < b[i]) return -1
  }
  if (!a[3] && b[3]) return 1
  if (a[3] && !b[3]) return -1
  if (a[3] && b[3]) return a[3].localeCompare(b[3])
  return 0
}

export interface FeedReleaseTag {
  tag: string
  version: string
}

export function parseReleaseTagsFromAtomFeed(xml: string, targetMajor: number): FeedReleaseTag[] {
  const matches = [...xml.matchAll(/\/tag\/(v?[0-9]+\.[0-9]+\.[0-9]+[^\/"]*)/g)]
  const tags: FeedReleaseTag[] = []
  const seen = new Set<string>()

  for (const match of matches) {
    const rawTag = match[1]
    const cleanVer = rawTag.replace(/^v/, '')
    if (seen.has(rawTag)) continue
    seen.add(rawTag)

    if (parseMajor(cleanVer) === targetMajor) {
      tags.push({ tag: rawTag, version: cleanVer })
    }
  }
  return tags
}

export async function discoverLatestMatchingRelease(
  currentVersion: string,
  fetchFeed: (url: string) => Promise<string>,
  feedUrl = 'https://github.com/tuannm711/BS-Coding/releases.atom'
): Promise<{ targetTag: string; targetVersion: string } | null> {
  const currentMajor = parseMajor(currentVersion)
  if (Number.isNaN(currentMajor)) return null

  try {
    const xml = await fetchFeed(feedUrl)
    const matchingTags = parseReleaseTagsFromAtomFeed(xml, currentMajor)
    let best: FeedReleaseTag | null = null

    for (const item of matchingTags) {
      if (compareSemver(item.version, currentVersion) > 0) {
        if (!best || compareSemver(item.version, best.version) > 0) {
          best = item
        }
      }
    }
    return best ? { targetTag: best.tag, targetVersion: best.version } : null
  } catch {
    return null
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function releaseNotesText(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  return notes[0]?.note ?? undefined
}

export class Updater {
  private checking = false
  private downloaded = false

  constructor(
    private readonly onStatus: (e: UpdaterStatusEvent) => void,
    private readonly env: UpdaterEnv
  ) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('download-progress', (progress) => {
      this.onStatus({ type: 'download-progress', percent: Math.round(progress.percent) })
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.downloaded = true
      this.onStatus({ type: 'downloaded', version: info.version })
    })
    autoUpdater.on('error', (err: Error, message?: string) => {
      this.onStatus({ type: 'error', message: message ?? err.message })
    })
  }

  isSupported(): boolean {
    return this.notSupportedReason() === null
  }

  async check(manual: boolean): Promise<void> {
    const reason = this.notSupportedReason()
    if (reason) {
      if (manual) this.onStatus({ type: 'not-supported', message: reason })
      return
    }
    if (this.checking) return
    this.checking = true
    this.downloaded = false
    try {
      if (manual) this.onStatus({ type: 'checking' })
      const currentVersion = this.env.getCurrentVersion()
      const currentMajor = parseMajor(currentVersion)

      // Layer 1: Update Discovery Isolation
      // Fetch release feed and find the latest release tag matching currentMajor.
      const fetchFn = this.env.fetchFeed || (typeof fetch !== 'undefined' ? (url: string) => fetch(url).then(r => r.text()) : undefined)
      if (fetchFn) {
        const discovered = await discoverLatestMatchingRelease(currentVersion, fetchFn)
        if (discovered) {
          // Direct autoUpdater to download manifests from the specific discovered release tag
          autoUpdater.setFeedURL({
            provider: 'generic',
            url: `https://github.com/tuannm711/BS-Coding/releases/download/${discovered.targetTag}`
          })
        }
      }

      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo
      if (!info || info.version === currentVersion) {
        this.onStatus({ type: 'up-to-date', currentVersion })
        return
      }

      // Layer 2: Major-Version Guard
      // Reject any update whose major version differs from the current app version.
      const updateMajor = parseMajor(info.version)
      if (currentMajor !== updateMajor) {
        this.onStatus({ type: 'up-to-date', currentVersion })
        return
      }

      this.onStatus({
        type: 'update-available',
        version: info.version,
        releaseNotes: releaseNotesText(info.releaseNotes),
        releaseDate: info.releaseDate,
        currentVersion
      })
    } catch (err) {
      this.onStatus({ type: 'error', message: errorMessage(err) })
    } finally {
      this.checking = false
    }
  }

  install(): void {
    if (this.downloaded) {
      // isSilent=true: apply the NSIS update without showing the installer
      // window; isForceRunAfter=true: relaunch the app once it is applied.
      autoUpdater.quitAndInstall(true, true)
      return
    }
    void autoUpdater.downloadUpdate().catch((err) => {
      this.onStatus({ type: 'error', message: errorMessage(err) })
    })
  }

  private notSupportedReason(): string | null {
    if (!this.env.isPackaged) return 'Auto-update is only available in packaged builds.'
    if (this.env.isPortable()) return 'Auto-update is not supported for the portable build.'
    const platform = this.env.platform ?? process.platform
    if (platform === 'linux' && !this.env.isAppImage()) {
      return 'Auto-update is only supported for the Linux AppImage build.'
    }
    return null
  }
}
