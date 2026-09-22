import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * A client identity borrowed from a coding client the user has actually
 * installed. BS Coding uses it as the transport identity when it talks to the
 * provider backend directly, instead of hardcoding a spoofed client string. The
 * version is read live from the installed client so it never rots to a
 * fabricated value, and subscription login is gated on `installed`.
 *
 * Two client shapes are supported:
 * - **CLI** (Codex): a `<bin> --version` command on PATH.
 * - **GUI app** (Antigravity): a desktop install with no working CLI; its
 *   version is read from the executable's Windows FileVersion.
 */
export interface BorrowedIdentity {
  installed: boolean
  version?: string
  userAgent?: string
  originator?: string
}

interface DetectOptions {
  refresh?: boolean
}

const cache = new Map<string, BorrowedIdentity>()

// `command` is built from fixed internal constants (never user input), so
// running it through the shell carries no injection risk. The shell is required
// on Windows so PATHEXT resolves the `.cmd` launcher shims that `execFile` (no
// shell) would miss with ENOENT.
function run(command: string): Promise<string | null> {
  return new Promise(resolve => {
    exec(command, { timeout: 4000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout ?? ''))
    })
  })
}

function parseSemver(output: string | null): string | undefined {
  if (!output) return undefined
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : undefined
}

/** Codex CLI: read the version from `codex --version`. */
function readCodexVersion(): Promise<string | undefined> {
  return run('codex --version').then(parseSemver)
}

/** Locate the installed Antigravity executable, or undefined if absent. */
function antigravityExePath(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return undefined
  const candidate = path.join(localAppData, 'Programs', 'antigravity', 'Antigravity.exe')
  return existsSync(candidate) ? candidate : undefined
}

/** Antigravity GUI app: read the exe's Windows FileVersion. */
async function readAntigravityVersion(): Promise<string | undefined> {
  const exe = antigravityExePath()
  if (!exe) return undefined
  const command = `powershell -NoProfile -Command "(Get-Item '${exe}').VersionInfo.FileVersion"`
  return parseSemver(await run(command))
}

async function detect(
  key: string,
  originator: string,
  readVersion: () => Promise<string | undefined>,
  opts?: DetectOptions
): Promise<BorrowedIdentity> {
  if (!opts?.refresh && cache.has(key)) return cache.get(key)!
  const version = await readVersion()
  const identity: BorrowedIdentity = version
    ? { installed: true, version, userAgent: `${originator}/${version}`, originator }
    : { installed: false }
  cache.set(key, identity)
  return identity
}

export function detectCodexIdentity(opts?: DetectOptions): Promise<BorrowedIdentity> {
  return detect('codex', 'codex_cli', readCodexVersion, opts)
}

export function detectAntigravityIdentity(opts?: DetectOptions): Promise<BorrowedIdentity> {
  return detect('antigravity', 'antigravity', readAntigravityVersion, opts)
}

/** Test hook: clears the in-process detection cache. */
export function __resetIdentityCacheForTests(): void {
  cache.clear()
}
