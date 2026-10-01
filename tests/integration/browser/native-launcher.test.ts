import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer, type Socket } from 'node:net'
import { randomBytes } from 'node:crypto'
import { NativeFrameDecoder, encodeNativeFrame } from '../../../src/main/browser/native-framing'

const supported = process.platform === 'win32'
describe.skipIf(!supported)('bundled Windows native launcher', () => {
  let directory: string
  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'BS native launcher with spaces '))
    execFileSync(process.execPath, [path.resolve('scripts/build-native-host.mjs'), directory], { windowsHide: true, timeout: 30000 })
  })
  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it('runs Electron as Node and relays raw native frames from the helper through paths with spaces', async () => {
    const endpoint = `\\\\.\\pipe\\bs-native-launcher-test-${randomBytes(8).toString('hex')}`
    const token = 'b'.repeat(64)
    const runtimePath = path.resolve('node_modules/electron/dist/electron.exe')
    const scriptPath = path.join(directory, 'host.cjs')
    writeFileSync(path.join(directory, 'launcher.json'), JSON.stringify({ runtimePath, scriptPath }))
    writeFileSync(path.join(directory, 'connection.json'), JSON.stringify({ endpoint, token, extensionId: 'ebleahkdkcndndlmlaealbgohjchgdam' }))
    const received: unknown[] = []
    const sockets = new Set<Socket>()
    const server = createServer(socket => {
      sockets.add(socket)
      socket.on('error', () => {})
      const decoder = new NativeFrameDecoder()
      socket.on('data', data => {
        for (const message of decoder.push(Buffer.from(data))) {
          received.push(message)
          if ((message as { type: string }).type === 'host_auth') socket.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
          else socket.write(encodeNativeFrame({ type: 'hello_result', ok: true, value: 'Đã kết nối 👋' }))
        }
      })
    })
    await new Promise<void>(resolve => server.listen(endpoint, resolve))
    const child = spawn(path.join(directory, 'launcher.exe'), ['chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/'], { stdio: 'pipe', windowsHide: true })
    child.stdin.on('error', () => {})
    const frames: unknown[] = []
    const stderr: Buffer[] = []
    const decoder = new NativeFrameDecoder()
    child.stdout.on('data', data => frames.push(...decoder.push(data)))
    child.stderr.on('data', data => stderr.push(data))
    const exited = new Promise<number | null>(resolve => child.once('close', resolve))
    try {
      child.stdin.write(encodeNativeFrame({ type: 'hello', value: 'Xin chào' }))
      const deadline = Date.now() + 5000
      while (!frames.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      expect(frames).toEqual([{ type: 'hello_result', ok: true, value: 'Đã kết nối 👋' }])
      expect(received).toEqual([{ type: 'host_auth', token, origin: 'chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/' }, { type: 'hello', value: 'Xin chào' }])
      child.stdin.end()
      expect(await exited).toBe(0)
      expect(Buffer.concat(stderr).toString()).toBe('')
      expect(readFileSync(scriptPath).byteLength).toBeGreaterThan(100)
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('terminates its bundled runtime when Chrome terminates the launcher abruptly', async () => {
    const scriptPath = path.join(directory, 'cleanup-fixture.cjs')
    const pidPath = path.join(directory, 'runtime.pid')
    writeFileSync(scriptPath, `require('node:fs').writeFileSync(${JSON.stringify(pidPath)},String(process.pid));setInterval(()=>{},1000)`)
    writeFileSync(path.join(directory, 'launcher.json'), JSON.stringify({ runtimePath: path.resolve('node_modules/electron/dist/electron.exe'), scriptPath }))
    const child = spawn(path.join(directory, 'launcher.exe'), ['chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/'], { stdio: 'pipe', windowsHide: true })
    const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
    let runtimePid: number | undefined
    try {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        try { runtimePid = Number(readFileSync(pidPath, 'utf8')); break } catch { await new Promise(resolve => setTimeout(resolve, 10)) }
      }
      expect(runtimePid).toBeGreaterThan(0)
      child.kill()
      await exited
      const cleanupDeadline = Date.now() + 3000
      let running = true
      while (running && Date.now() < cleanupDeadline) {
        try { process.kill(runtimePid!, 0); await new Promise(resolve => setTimeout(resolve, 10)) } catch { running = false }
      }
      expect(running).toBe(false)
    } finally {
      if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
      if (runtimePid) { try { process.kill(runtimePid) } catch { /* already exited */ } }
    }
  })

  it('terminates after Chrome closes input while output is blocked', async () => {
    const endpoint = `\\\\.\\pipe\\bs-native-launcher-backpressure-${randomBytes(8).toString('hex')}`
    writeFileSync(path.join(directory, 'launcher.json'), JSON.stringify({ runtimePath: path.resolve('node_modules/electron/dist/electron.exe'), scriptPath: path.join(directory, 'host.cjs') }))
    writeFileSync(path.join(directory, 'connection.json'), JSON.stringify({ endpoint, token: 'c'.repeat(64), extensionId: 'ebleahkdkcndndlmlaealbgohjchgdam' }))
    let connected = false
    const sockets = new Set<Socket>()
    const server = createServer(socket => {
      sockets.add(socket)
      socket.on('error', () => {})
      const decoder = new NativeFrameDecoder()
      socket.on('data', data => {
        for (const _message of decoder.push(Buffer.from(data))) {
          socket.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
          socket.write(encodeNativeFrame({ type: 'cmd', value: 'x'.repeat(800000) }))
          connected = true
        }
      })
    })
    await new Promise<void>(resolve => server.listen(endpoint, resolve))
    const child = spawn(path.join(directory, 'launcher.exe'), ['chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/'], { stdio: 'pipe', windowsHide: true })
    child.stdout.pause()
    child.stdin.on('error', () => {})
    const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
    const exitEvent = new Promise<number | null>(resolve => child.once('exit', resolve))
    try {
      const deadline = Date.now() + 5000
      while (!connected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      expect(connected).toBe(true)
      // Let the relay fill Chrome's unread pipe before closing the other direction.
      await new Promise(resolve => setTimeout(resolve, 50))
      child.stdin.end()
      const result = await Promise.race([exitEvent, new Promise<string>(resolve => setTimeout(() => resolve('launcher remained alive'), 3500))])
      child.stdout.resume()
      expect(result).not.toBe('launcher remained alive')
      await exited
    } finally {
      child.stdout.resume()
      if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })
})
