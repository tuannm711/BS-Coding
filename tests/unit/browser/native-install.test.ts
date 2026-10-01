import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { deriveNativeEndpoint, getNativeConnectionConfig, prepareNativeHost, refreshNativeHostIfInstalled } from '../../../src/main/browser/native-install'

const directories: string[] = []
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-native-install-'))
  directories.push(root)
  const sourceDir = path.join(root, 'build output')
  mkdirSync(sourceDir)
  writeFileSync(path.join(sourceDir, 'host.cjs'), 'fixture helper v1')
  writeFileSync(path.join(sourceDir, 'launcher.exe'), 'fixture launcher')
  const runtimePath = path.join(root, 'Electron runtime.exe')
  writeFileSync(runtimePath, 'fixture runtime')
  return { root, sourceDir, runtimePath, userDataDir: path.join(root, 'user data'), homeDir: path.join(root, 'home') }
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }) })

describe('native host installation', () => {
  it('refreshes the runtime after an opted-in portable app update without registering on first startup', async () => {
    const inputs = fixture()
    let registered = 0
    const register = async () => { registered++ }
    expect(await refreshNativeHostIfInstalled({ ...inputs, platform: 'win32', register })).toBeUndefined()
    expect(registered).toBe(0)
    const installed = await prepareNativeHost({ ...inputs, platform: 'win32', register })
    expect(installed.installed).toBe(true)
    const updatedRuntime = path.join(inputs.sourceDir, 'new portable runtime.exe')
    writeFileSync(updatedRuntime, 'fixture new runtime')
    const refreshed = await refreshNativeHostIfInstalled({ ...inputs, runtimePath: updatedRuntime, platform: 'win32', register })
    expect(refreshed?.installed).toBe(true)
    const manifest = JSON.parse(readFileSync(installed.manifestPath, 'utf8'))
    const launcher = JSON.parse(readFileSync(path.join(path.dirname(manifest.path), 'launcher.json'), 'utf8'))
    expect(launcher.runtimePath).toBe(updatedRuntime)
    expect(registered).toBe(2)
  })
  it('persists one random installation credential and a stable Windows pipe without registration', () => {
    const { userDataDir } = fixture()
    const initial = getNativeConnectionConfig(userDataDir, 'win32')
    expect(initial.token).toMatch(/^[0-9a-f]{64}$/)
    expect(initial.extensionId).toBe('ebleahkdkcndndlmlaealbgohjchgdam')
    expect(initial.endpoint).toMatch(/^\\\\\.\\pipe\\bs-coding-browser-[0-9a-f]+$/)
    expect(getNativeConnectionConfig(userDataDir, 'win32')).toEqual(initial)
    expect(deriveNativeEndpoint(userDataDir, 'win32')).toBe(initial.endpoint)
    expect(readdirSync(path.join(userDataDir, 'browser-native-host'))).toEqual(['connection.json'])
  })

  it('derives a short user-specific Unix socket for long application paths', () => {
    const endpoint = deriveNativeEndpoint('/home/user/' + 'long-directory/'.repeat(20), 'linux')
    expect(Buffer.byteLength(endpoint)).toBeLessThan(100)
    expect(endpoint).toMatch(/^\/tmp\/bs-coding-\d+-[a-f0-9]+\/browser\.sock$/)
    expect(deriveNativeEndpoint('/home/other', 'linux')).not.toBe(endpoint)
  })

  it('prepares an immutable helper copy and an allowlisted absolute Windows manifest', async () => {
    const inputs = fixture()
    const registrationReceipt = path.join(inputs.root, 'registered.json')
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', register: async (manifestPath, platform) => {
      writeFileSync(registrationReceipt, JSON.stringify({ manifestPath, platform }))
    } })
    expect(result.installed).toBe(true)
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
    expect(manifest).toMatchObject({ name: 'com.bscoding.browser', type: 'stdio', allowed_origins: ['chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/'] })
    expect(path.isAbsolute(manifest.path)).toBe(true)
    expect(path.basename(manifest.path)).toBe('launcher.exe')
    expect(readFileSync(manifest.path, 'utf8')).toBe('fixture launcher')
    const installedDir = path.dirname(manifest.path)
    expect(JSON.parse(readFileSync(path.join(installedDir, 'connection.json'), 'utf8'))).toEqual(getNativeConnectionConfig(inputs.userDataDir, 'win32'))
    expect(JSON.parse(readFileSync(path.join(installedDir, 'launcher.json'), 'utf8'))).toEqual({ runtimePath: inputs.runtimePath, scriptPath: path.join(installedDir, 'host.cjs') })
    expect(JSON.parse(readFileSync(registrationReceipt, 'utf8'))).toEqual({ manifestPath: result.manifestPath, platform: 'win32' })
  })

  it('uses a new helper directory on update and retains the previous running executable', async () => {
    const inputs = fixture()
    const options = { ...inputs, platform: 'win32' as const, register: async () => {} }
    const first = await prepareNativeHost(options)
    const oldPath = JSON.parse(readFileSync(first.manifestPath, 'utf8')).path as string
    const credential = getNativeConnectionConfig(inputs.userDataDir, 'win32').token
    writeFileSync(path.join(inputs.sourceDir, 'host.cjs'), 'fixture helper v2')
    const next = await prepareNativeHost(options)
    const newPath = JSON.parse(readFileSync(next.manifestPath, 'utf8')).path as string
    expect(newPath).not.toBe(oldPath)
    expect(readFileSync(oldPath, 'utf8')).toBe('fixture launcher')
    expect(readFileSync(path.join(path.dirname(newPath), 'host.cjs'), 'utf8')).toBe('fixture helper v2')
    expect(getNativeConnectionConfig(inputs.userDataDir, 'win32').token).toBe(credential)
  })

  it.each([
    ['linux', '.config/google-chrome/NativeMessagingHosts/com.bscoding.browser.json'],
    ['darwin', 'Library/Application Support/Google/Chrome/NativeMessagingHosts/com.bscoding.browser.json']
  ] as const)('writes the Chrome user manifest and executable wrapper for %s', async (platform, suffix) => {
    const inputs = fixture()
    const result = await prepareNativeHost({ ...inputs, platform, register: async () => {} })
    expect(result.installed).toBe(true)
    expect(result.manifestPath).toBe(path.join(inputs.homeDir, suffix))
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
    const wrapper = readFileSync(manifest.path, 'utf8')
    expect(wrapper.startsWith('#!/bin/sh\n')).toBe(true)
    expect(wrapper).toContain('ELECTRON_RUN_AS_NODE=1 exec ')
    expect(wrapper).toContain('"$@"')
    if (process.platform !== 'win32') {
      expect(statSync(manifest.path).mode & 0o777).toBe(0o700)
      expect(statSync(path.join(inputs.userDataDir, 'browser-native-host', 'connection.json')).mode & 0o777).toBe(0o600)
    }
  })

  it('fails before registration when the bundled runtime or helper is absent', async () => {
    const inputs = fixture()
    rmSync(inputs.runtimePath)
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', register: async () => { throw new Error('registration must not run') } })
    expect(result.installed).toBe(false)
    expect(result.error).toMatch(/runtime/i)
  })

  it('restores the previous manifest if registration fails', async () => {
    const inputs = fixture()
    const initial = await prepareNativeHost({ ...inputs, platform: 'win32', register: async () => {} })
    const previous = readFileSync(initial.manifestPath, 'utf8')
    writeFileSync(path.join(inputs.sourceDir, 'host.cjs'), 'replacement helper')
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', register: async () => { throw new Error('Registration unavailable') } })
    expect(result.installed).toBe(false)
    expect(result.error).toBe('Registration unavailable')
    expect(readFileSync(initial.manifestPath, 'utf8')).toBe(previous)
  })

  it('fails closed instead of replacing a corrupt persisted credential', () => {
    const { userDataDir } = fixture()
    getNativeConnectionConfig(userDataDir, 'win32')
    writeFileSync(path.join(userDataDir, 'browser-native-host', 'connection.json'), JSON.stringify({ token: 'invalid', endpoint: 'unexpected', extensionId: 'unexpected' }))
    expect(() => getNativeConnectionConfig(userDataDir, 'win32')).toThrow(/configuration|credential/i)
  })

  it.each(['host.cjs', 'launcher.exe'] as const)('repairs a corrupted installed %s into a new directory without overwriting old bytes', async filename => {
    const inputs = fixture()
    const options = { ...inputs, platform: 'win32' as const, register: async () => {} }
    const initial = await prepareNativeHost(options)
    const oldPath = JSON.parse(readFileSync(initial.manifestPath, 'utf8')).path as string
    const corruptPath = path.join(path.dirname(oldPath), filename)
    writeFileSync(corruptPath, 'corrupted running resource')
    const repaired = await prepareNativeHost(options)
    expect(repaired.installed).toBe(true)
    const newPath = JSON.parse(readFileSync(repaired.manifestPath, 'utf8')).path as string
    expect(newPath).not.toBe(oldPath)
    expect(readFileSync(corruptPath, 'utf8')).toBe('corrupted running resource')
    expect(readFileSync(path.join(path.dirname(newPath), filename))).toEqual(readFileSync(path.join(inputs.sourceDir, filename)))
    expect(readFileSync(path.join(path.dirname(newPath), 'host.cjs'))).toEqual(readFileSync(path.join(inputs.sourceDir, 'host.cjs')))
    expect(readFileSync(newPath)).toEqual(readFileSync(path.join(inputs.sourceDir, 'launcher.exe')))
  })

  it('repairs an incomplete installed helper into a fresh directory', async () => {
    const inputs = fixture()
    const options = { ...inputs, platform: 'win32' as const, register: async () => {} }
    const initial = await prepareNativeHost(options)
    const oldPath = JSON.parse(readFileSync(initial.manifestPath, 'utf8')).path as string
    rmSync(path.join(path.dirname(oldPath), 'host.cjs'))
    const repaired = await prepareNativeHost(options)
    const newPath = JSON.parse(readFileSync(repaired.manifestPath, 'utf8')).path as string
    expect(repaired.installed).toBe(true)
    expect(newPath).not.toBe(oldPath)
    expect(readFileSync(oldPath, 'utf8')).toBe('fixture launcher')
    expect(readFileSync(path.join(path.dirname(newPath), 'host.cjs'), 'utf8')).toBe('fixture helper v1')
  })

  it('leaves a corrupt credential unchanged unless repairConfig was explicitly requested', async () => {
    const inputs = fixture()
    getNativeConnectionConfig(inputs.userDataDir, 'win32')
    const filename = path.join(inputs.userDataDir, 'browser-native-host', 'connection.json')
    writeFileSync(filename, '{broken JSON')
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', register: async () => {} })
    expect(result.installed).toBe(false)
    expect(readFileSync(filename, 'utf8')).toBe('{broken JSON')
    expect(readdirSync(path.dirname(filename))).toEqual(['connection.json'])
  })

  it.each(['{broken JSON', JSON.stringify({ endpoint: 'wrong', token: 'bad', extensionId: 'wrong' })])('backs up invalid configuration and regenerates a credential only during explicit repair', async corrupted => {
    const inputs = fixture()
    const old = getNativeConnectionConfig(inputs.userDataDir, 'win32')
    const directory = path.join(inputs.userDataDir, 'browser-native-host')
    writeFileSync(path.join(directory, 'connection.json'), corrupted)
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', repairConfig: true, register: async () => {} })
    expect(result.installed).toBe(true)
    const config = getNativeConnectionConfig(inputs.userDataDir, 'win32')
    expect(config.token).toMatch(/^[a-f0-9]{64}$/)
    expect(config.token).not.toBe(old.token)
    expect(config.endpoint).toBe(old.endpoint)
    const backups = readdirSync(directory).filter(name => name.startsWith('connection.json.corrupt-'))
    expect(backups).toHaveLength(1)
    expect(readFileSync(path.join(directory, backups[0]), 'utf8')).toBe(corrupted)
    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'))
    expect(JSON.parse(readFileSync(path.join(path.dirname(manifest.path), 'connection.json'), 'utf8'))).toEqual(config)
  })

  it('preserves a valid configuration and credential during explicit repair', async () => {
    const inputs = fixture()
    const initial = getNativeConnectionConfig(inputs.userDataDir, 'win32')
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', repairConfig: true, register: async () => {} })
    expect(result.installed).toBe(true)
    expect(getNativeConnectionConfig(inputs.userDataDir, 'win32')).toEqual(initial)
    expect(readdirSync(path.join(inputs.userDataDir, 'browser-native-host')).some(name => name.startsWith('connection.json.corrupt-'))).toBe(false)
  })

  it('does not classify filesystem read failures as invalid JSON eligible for repair', async () => {
    const inputs = fixture()
    getNativeConnectionConfig(inputs.userDataDir, 'win32')
    const directory = path.join(inputs.userDataDir, 'browser-native-host')
    const filename = path.join(directory, 'connection.json')
    rmSync(filename)
    mkdirSync(filename)
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', repairConfig: true, register: async () => {} })
    expect(result.installed).toBe(false)
    expect(statSync(filename).isDirectory()).toBe(true)
    expect(readdirSync(directory)).toEqual(['connection.json'])
  })

  it('returns installation failure if the private configuration directory cannot be prepared', async () => {
    const inputs = fixture()
    mkdirSync(inputs.userDataDir)
    writeFileSync(path.join(inputs.userDataDir, 'browser-native-host'), 'blocked directory')
    const result = await prepareNativeHost({ ...inputs, platform: 'win32', repairConfig: true, register: async () => {} })
    expect(result.installed).toBe(false)
    expect(readFileSync(path.join(inputs.userDataDir, 'browser-native-host'), 'utf8')).toBe('blocked directory')
  })

  it('restores the prior manifest after a repaired helper cannot be registered', async () => {
    const inputs = fixture()
    const options = { ...inputs, platform: 'win32' as const, register: async () => {} }
    const initial = await prepareNativeHost(options)
    const previous = readFileSync(initial.manifestPath, 'utf8')
    const oldPath = JSON.parse(previous).path as string
    writeFileSync(oldPath, 'corrupt launcher retained')
    const result = await prepareNativeHost({ ...options, register: async () => { throw new Error('Registration unavailable') } })
    expect(result.installed).toBe(false)
    expect(readFileSync(initial.manifestPath, 'utf8')).toBe(previous)
    expect(readFileSync(oldPath, 'utf8')).toBe('corrupt launcher retained')
  })
})
