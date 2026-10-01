import { createHash, randomBytes } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { NATIVE_EXTENSION_ID, NATIVE_HOST_NAME } from '../../shared/browser-native'

const runFile = promisify(execFile)
const CONFIG_FILE = 'connection.json'

export interface NativeConnectionConfig { endpoint: string; token: string; extensionId: string }
export interface NativeHostInstallOptions {
  userDataDir: string
  sourceDir: string
  runtimePath: string
  platform?: NodeJS.Platform
  homeDir?: string
  repairConfig?: boolean
  register?: (manifestPath: string, platform: NodeJS.Platform) => Promise<void>
}
export interface NativeHostInstallResult { installed: boolean; manifestPath: string; error?: string }

class InvalidConnectionConfig extends Error {
  constructor() { super('Invalid native host configuration or credential') }
}

export function deriveNativeEndpoint(userDataDir: string, platform: NodeJS.Platform = process.platform): string {
  const canonical = path.resolve(userDataDir)
  const hash = createHash('sha256').update(platform === 'win32' ? canonical.toLowerCase() : canonical).digest('hex').slice(0, 24)
  if (platform === 'win32') return `\\\\.\\pipe\\bs-coding-browser-${hash}`
  return `/tmp/bs-coding-${process.getuid?.() ?? 0}-${hash}/browser.sock`
}

function privateDirectory(directory: string): void {
  const existed = existsSync(directory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const info = lstatSync(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Native host directory must be a private directory')
  if (process.platform === 'win32') {
    if (!existed) {
      const domain = process.env.USERDOMAIN
      const account = domain ? `${domain}\\${userInfo().username}` : userInfo().username
      const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
      execFileSync(path.join(systemRoot, 'System32', 'icacls.exe'), [directory, '/inheritance:r', '/grant:r', `${account}:(OI)(CI)F`], { windowsHide: true, stdio: 'pipe', timeout: 10000 })
    }
  } else {
    if (info.uid !== process.getuid?.()) throw new Error('Native host directory belongs to a different user')
    chmodSync(directory, 0o700)
  }
}

function atomicWrite(filename: string, contents: string | Buffer, mode = 0o600): void {
  const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`
  try {
    writeFileSync(temporary, contents, { flag: 'wx', mode })
    renameSync(temporary, filename)
    if (process.platform !== 'win32') chmodSync(filename, mode)
  } finally { rmSync(temporary, { force: true }) }
}

export function getNativeConnectionConfig(userDataDir: string, platform: NodeJS.Platform = process.platform): NativeConnectionConfig {
  const directory = path.join(path.resolve(userDataDir), 'browser-native-host')
  privateDirectory(directory)
  const endpoint = deriveNativeEndpoint(userDataDir, platform)
  if (platform === process.platform && platform !== 'win32') privateDirectory(path.dirname(endpoint))
  const filename = path.join(directory, CONFIG_FILE)
  if (existsSync(filename)) {
    // Read failures remain filesystem failures, not corruption eligible for repair.
    const contents = readFileSync(filename, 'utf8')
    let stored: unknown
    try { stored = JSON.parse(contents) } catch (error) {
      if (error instanceof SyntaxError) throw new InvalidConnectionConfig()
      throw error
    }
    if (!stored || typeof stored !== 'object') throw new InvalidConnectionConfig()
    const config = stored as Partial<NativeConnectionConfig>
    if (config.endpoint !== endpoint || config.extensionId !== NATIVE_EXTENSION_ID || typeof config.token !== 'string' || !/^[a-f0-9]{64}$/.test(config.token)) throw new InvalidConnectionConfig()
    if (process.platform !== 'win32') chmodSync(filename, 0o600)
    return { endpoint, token: config.token, extensionId: NATIVE_EXTENSION_ID }
  }
  const config = { endpoint, token: randomBytes(32).toString('hex'), extensionId: NATIVE_EXTENSION_ID }
  // Exclusive creation retains a credential from another app process racing initial startup.
  try { writeFileSync(filename, JSON.stringify(config), { flag: 'wx', mode: 0o600 }) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return getNativeConnectionConfig(userDataDir, platform)
  }
  return config
}

function manifestLocation(options: NativeHostInstallOptions, platform: NodeJS.Platform): string {
  const home = options.homeDir ?? homedir()
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`)
  if (platform === 'linux') return path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', `${NATIVE_HOST_NAME}.json`)
  return path.join(path.resolve(options.userDataDir), 'browser-native-host', `${NATIVE_HOST_NAME}.json`)
}

async function registerChromeHost(manifestPath: string, platform: NodeJS.Platform): Promise<void> {
  if (platform !== 'win32') return // Chrome discovers the user-level manifest file directly.
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const registryPath = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`
  await runFile(path.join(systemRoot, 'System32', 'reg.exe'), ['add', registryPath, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f', '/reg:32'], { windowsHide: true, timeout: 10000 })
}

function shellQuote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'` }

function connectionConfigForSetup(options: NativeHostInstallOptions, platform: NodeJS.Platform): NativeConnectionConfig {
  try { return getNativeConnectionConfig(options.userDataDir, platform) } catch (error) {
    if (!options.repairConfig || !(error instanceof InvalidConnectionConfig)) throw error
    const directory = path.join(path.resolve(options.userDataDir), 'browser-native-host')
    const filename = path.join(directory, CONFIG_FILE)
    // The default reader already prepared the private directory successfully.
    // Retain corrupted bytes for recovery before rotating an explicitly repaired credential.
    const backup = `${filename}.corrupt-${Date.now()}-${randomBytes(8).toString('hex')}`
    atomicWrite(backup, readFileSync(filename))
    const config = { endpoint: deriveNativeEndpoint(options.userDataDir, platform), token: randomBytes(32).toString('hex'), extensionId: NATIVE_EXTENSION_ID }
    atomicWrite(filename, JSON.stringify(config))
    return config
  }
}

function installedBytesMatch(filename: string, expected: Buffer): boolean {
  try {
    const info = lstatSync(filename)
    if (!info.isFile() || info.isSymbolicLink()) return false
    return readFileSync(filename).equals(expected)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function chooseInstallDirectory(baseDirectory: string, script: Buffer, launcher?: Buffer): string {
  if (!existsSync(baseDirectory)) return baseDirectory
  const scriptMatches = installedBytesMatch(path.join(baseDirectory, 'host.cjs'), script)
  const launcherMatches = !launcher || installedBytesMatch(path.join(baseDirectory, 'launcher.exe'), launcher)
  if (scriptMatches && launcherMatches) return baseDirectory
  // A partial/corrupt installation may include an executable still in use.
  // Publish a complete fresh copy rather than modifying any existing binary.
  return `${baseDirectory}-repair-${randomBytes(8).toString('hex')}`
}

export async function prepareNativeHost(options: NativeHostInstallOptions): Promise<NativeHostInstallResult> {
  const platform = options.platform ?? process.platform
  const manifestPath = manifestLocation(options, platform)
  let previous: Buffer | undefined
  let manifestWritten = false
  try {
    if (!['win32', 'darwin', 'linux'].includes(platform)) throw new Error(`Native browser setup is unsupported on ${platform}`)
    const runtimePath = path.resolve(options.runtimePath)
    if (!existsSync(runtimePath) || !statSync(runtimePath).isFile()) throw new Error('Bundled Electron runtime is missing')
    const sourceDir = path.resolve(options.sourceDir)
    const script = readFileSync(path.join(sourceDir, 'host.cjs'))
    const launcher = platform === 'win32' ? readFileSync(path.join(sourceDir, 'launcher.exe')) : undefined
    const config = connectionConfigForSetup(options, platform)
    const digest = createHash('sha256').update(script).update(launcher ?? 'unix-wrapper-v1').digest('hex').slice(0, 24)
    const baseDirectory = path.join(path.resolve(options.userDataDir), 'browser-native-host', digest)
    const installDir = chooseInstallDirectory(baseDirectory, script, launcher)
    privateDirectory(installDir)
    const scriptPath = path.join(installDir, 'host.cjs')
    if (!existsSync(scriptPath)) writeFileSync(scriptPath, script, { flag: 'wx', mode: 0o600 })
    atomicWrite(path.join(installDir, CONFIG_FILE), JSON.stringify(config))
    const launcherPath = path.join(installDir, platform === 'win32' ? 'launcher.exe' : 'launcher.sh')
    if (platform === 'win32') {
      if (!existsSync(launcherPath)) writeFileSync(launcherPath, launcher!, { flag: 'wx', mode: 0o700 })
      atomicWrite(path.join(installDir, 'launcher.json'), JSON.stringify({ runtimePath, scriptPath }))
    } else {
      atomicWrite(launcherPath, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${shellQuote(runtimePath)} ${shellQuote(scriptPath)} "$@"\n`, 0o700)
    }
    if (!installedBytesMatch(scriptPath, script) || (launcher && !installedBytesMatch(launcherPath, launcher))) throw new Error('Native helper installation verification failed')
    const manifest = { name: NATIVE_HOST_NAME, description: 'BS Coding browser connection', path: launcherPath, type: 'stdio', allowed_origins: [`chrome-extension://${NATIVE_EXTENSION_ID}/`] }
    mkdirSync(path.dirname(manifestPath), { recursive: true })
    previous = existsSync(manifestPath) ? readFileSync(manifestPath) : undefined
    atomicWrite(manifestPath, JSON.stringify(manifest, null, 2))
    manifestWritten = true
    await (options.register ?? registerChromeHost)(manifestPath, platform)
    atomicWrite(path.join(path.resolve(options.userDataDir), 'browser-native-host', 'installed.json'), JSON.stringify({ version: 1, platform }))
    return { installed: true, manifestPath }
  } catch (error) {
    if (manifestWritten) {
      try {
        if (previous) atomicWrite(manifestPath, previous)
        else rmSync(manifestPath, { force: true })
      } catch { /* Preserve the setup error; a later repair can restore a missing manifest. */ }
    }
    return { installed: false, manifestPath, error: error instanceof Error ? error.message : 'Native browser setup failed' }
  }
}

// Refresh only a user's previously opted-in installation. This updates the
// Electron path after portable extraction/app updates without first-run host
// registration or automatic recovery of corrupt authentication credentials.
export async function refreshNativeHostIfInstalled(options: NativeHostInstallOptions): Promise<NativeHostInstallResult | undefined> {
  const marker = path.join(path.resolve(options.userDataDir), 'browser-native-host', 'installed.json')
  if (!existsSync(marker)) return undefined
  return prepareNativeHost({ ...options, repairConfig: false })
}
