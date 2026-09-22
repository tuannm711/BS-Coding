import { describe, it, expect, vi, beforeEach } from 'vitest'

const execMock = vi.fn()
vi.mock('node:child_process', () => ({
  exec: (...args: unknown[]) => execMock(...args)
}))

import {
  detectCodexIdentity,
  detectAntigravityIdentity,
  __resetIdentityCacheForTests
} from '../../src/main/providers/identity/client-identity'

type ExecCb = (err: Error | null, stdout?: string, stderr?: string) => void

function whenVersion(stdout: string | null): void {
  execMock.mockImplementation((_cmd: string, _opts: unknown, cb: ExecCb) => {
    if (stdout === null) cb(new Error('ENOENT'))
    else cb(null, stdout, '')
  })
}

beforeEach(() => {
  execMock.mockReset()
  __resetIdentityCacheForTests()
})

describe('detectCodexIdentity', () => {
  it('parses version and builds honest identity when installed', async () => {
    whenVersion('codex-cli 0.155.0\n')
    const id = await detectCodexIdentity()
    expect(id).toEqual({
      installed: true,
      version: '0.155.0',
      userAgent: 'codex_cli/0.155.0',
      originator: 'codex_cli'
    })
  })

  it('reports not installed when the binary is missing', async () => {
    whenVersion(null)
    expect(await detectCodexIdentity()).toEqual({ installed: false })
  })

  it('caches the result across calls (one spawn) until refresh', async () => {
    whenVersion('codex-cli 0.155.0\n')
    await detectCodexIdentity()
    await detectCodexIdentity()
    expect(execMock).toHaveBeenCalledTimes(1)
    await detectCodexIdentity({ refresh: true })
    expect(execMock).toHaveBeenCalledTimes(2)
  })

  it('treats unparseable version output as not installed', async () => {
    whenVersion('garbage output with no semver\n')
    expect(await detectCodexIdentity()).toEqual({ installed: false })
  })
})

describe('detectAntigravityIdentity', () => {
  it('builds an antigravity identity from the installed version', async () => {
    whenVersion('antigravity 1.20.7\n')
    const id = await detectAntigravityIdentity()
    expect(id).toEqual({
      installed: true,
      version: '1.20.7',
      userAgent: 'antigravity/1.20.7',
      originator: 'antigravity'
    })
  })

  it('reports not installed when the binary is missing', async () => {
    whenVersion(null)
    expect(await detectAntigravityIdentity()).toEqual({ installed: false })
  })
})
