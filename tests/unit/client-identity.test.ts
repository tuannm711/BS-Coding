import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const execMock = vi.fn()
const existsSyncMock = vi.fn()
vi.mock('node:child_process', () => ({
  exec: (...args: unknown[]) => execMock(...args)
}))
vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => existsSyncMock(...args)
}))

import {
  detectCodexIdentity,
  detectAntigravityIdentity,
  __resetIdentityCacheForTests
} from '../../src/main/providers/identity/client-identity'

type ExecCb = (err: Error | null, stdout?: string, stderr?: string) => void

// Route the mocked exec by the command it is given: the CLI `--version` for
// Codex, and a PowerShell FileVersion query for the Antigravity exe.
function whenCommands(map: { codex?: string | null; powershell?: string | null }): void {
  execMock.mockImplementation((command: string, _opts: unknown, cb: ExecCb) => {
    const out = /powershell/i.test(command) ? map.powershell : map.codex
    if (out === null || out === undefined) cb(new Error('ENOENT'))
    else cb(null, out, '')
  })
}

beforeEach(() => {
  execMock.mockReset()
  existsSyncMock.mockReset()
  existsSyncMock.mockReturnValue(false)
  // Antigravity detection reads %LOCALAPPDATA%; stub it so the test is
  // deterministic on non-Windows CI where the variable is absent.
  vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\test\\AppData\\Local')
  __resetIdentityCacheForTests()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('detectCodexIdentity (CLI)', () => {
  it('parses the version and builds an honest identity when installed', async () => {
    whenCommands({ codex: 'codex-cli 0.155.0\n' })
    expect(await detectCodexIdentity({ refresh: true })).toEqual({
      installed: true,
      version: '0.155.0',
      userAgent: 'codex_cli/0.155.0',
      originator: 'codex_cli'
    })
  })

  it('reports not installed when the binary is missing', async () => {
    whenCommands({ codex: null })
    expect(await detectCodexIdentity({ refresh: true })).toEqual({ installed: false })
  })

  it('caches the result across calls until refresh', async () => {
    whenCommands({ codex: 'codex-cli 0.155.0\n' })
    await detectCodexIdentity()
    await detectCodexIdentity()
    expect(execMock).toHaveBeenCalledTimes(1)
    await detectCodexIdentity({ refresh: true })
    expect(execMock).toHaveBeenCalledTimes(2)
  })
})

describe('detectAntigravityIdentity (GUI app)', () => {
  it('detects Antigravity from the installed exe FileVersion', async () => {
    existsSyncMock.mockReturnValue(true)
    whenCommands({ powershell: '2.15.1\n' })
    const id = await detectAntigravityIdentity({ refresh: true })
    expect(id).toEqual({
      installed: true,
      version: '2.15.1',
      userAgent: 'antigravity/2.15.1',
      originator: 'antigravity'
    })
  })

  it('reports not installed when the Antigravity exe is absent', async () => {
    existsSyncMock.mockReturnValue(false)
    const id = await detectAntigravityIdentity({ refresh: true })
    expect(id).toEqual({ installed: false })
    // The exe was never found, so no version query is spawned.
    expect(execMock).not.toHaveBeenCalled()
  })

  it('reports not installed when the version output is unparseable', async () => {
    existsSyncMock.mockReturnValue(true)
    whenCommands({ powershell: 'no version here\n' })
    expect(await detectAntigravityIdentity({ refresh: true })).toEqual({ installed: false })
  })
})
