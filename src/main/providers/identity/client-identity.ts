import { execFile } from 'node:child_process'

/**
 * A client identity borrowed from a coding CLI the user has actually installed
 * (Codex CLI, Antigravity). BS Coding uses it as the transport identity when it
 * talks to the provider backend directly, instead of hardcoding a spoofed
 * client string. The version is read live from the installed binary so it never
 * rots to a fabricated value, and subscription login is gated on `installed`.
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

function readVersion(bin: string): Promise<string | null> {
  return new Promise(resolve => {
    execFile(bin, ['--version'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout ?? ''))
    })
  })
}

function parseSemver(output: string | null): string | undefined {
  if (!output) return undefined
  const match = output.match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : undefined
}

async function detect(
  key: string,
  bin: string,
  originator: string,
  opts?: DetectOptions
): Promise<BorrowedIdentity> {
  if (!opts?.refresh && cache.has(key)) return cache.get(key)!
  const version = parseSemver(await readVersion(bin))
  const identity: BorrowedIdentity = version
    ? { installed: true, version, userAgent: `${originator}/${version}`, originator }
    : { installed: false }
  cache.set(key, identity)
  return identity
}

export function detectCodexIdentity(opts?: DetectOptions): Promise<BorrowedIdentity> {
  return detect('codex', 'codex', 'codex_cli', opts)
}

export function detectAntigravityIdentity(opts?: DetectOptions): Promise<BorrowedIdentity> {
  return detect('antigravity', 'antigravity', 'antigravity', opts)
}

/** Test hook: clears the in-process detection cache. */
export function __resetIdentityCacheForTests(): void {
  cache.clear()
}
