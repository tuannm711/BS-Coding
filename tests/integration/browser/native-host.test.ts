import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { build } from 'esbuild'
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { NativeFrameDecoder, encodeNativeFrame } from '../../../src/main/browser/native-framing'

const ORIGIN = 'chrome-extension://ebleahkdkcndndlmlaealbgohjchgdam/'
const TOKEN = 'a'.repeat(64)
let outputDir: string
const children = new Set<ChildProcessWithoutNullStreams>()
const servers = new Set<Server>()
const sockets = new Set<Socket>()
const fixtures: string[] = []

beforeAll(async () => {
  outputDir = mkdtempSync(path.join(tmpdir(), 'bs-native-host-build-'))
  await build({ entryPoints: [path.resolve('src/browser-native-host/host.ts')], outfile: path.join(outputDir, 'host.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node20' })
})
afterEach(async () => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
      child.kill()
      await closed
    }
  }
  children.clear()
  for (const socket of sockets) socket.destroy()
  sockets.clear()
  for (const server of servers) await new Promise<void>(resolve => server.close(() => resolve()))
  servers.clear()
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true })
})
afterAll(() => rmSync(outputDir, { recursive: true, force: true }))

function configuration() {
  const directory = mkdtempSync(path.join(tmpdir(), 'bs-native-host-'))
  fixtures.push(directory)
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\bs-native-test-${randomBytes(8).toString('hex')}` : path.join(directory, 'app.sock')
  return { directory, endpoint }
}
async function listen(endpoint: string, receive: (message: unknown, socket: Socket) => void) {
  const server = createServer(socket => {
    sockets.add(socket)
    socket.on('error', () => {})
    const decoder = new NativeFrameDecoder()
    socket.on('data', data => { for (const message of decoder.push(Buffer.from(data))) receive(message, socket) })
  })
  servers.add(server)
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(endpoint, resolve) })
}
function launch(directory: string, endpoint: string, origin = ORIGIN) {
  // Copying the bundled entrypoint mimics a real installation with a sibling config file.
  const scriptPath = path.join(directory, 'host.cjs')
  copyFileSync(path.join(outputDir, 'host.cjs'), scriptPath)
  writeFileSync(path.join(directory, 'connection.json'), JSON.stringify({ endpoint, token: TOKEN, extensionId: 'ebleahkdkcndndlmlaealbgohjchgdam' }))
  const child = spawn(process.execPath, [scriptPath, origin], { stdio: 'pipe', windowsHide: true })
  children.add(child)
  child.stdin.on('error', () => {}) // Failure paths close input before pending writes complete.
  const stdout: unknown[] = []
  const decoder = new NativeFrameDecoder()
  const stderr: Buffer[] = []
  child.stdout.on('data', data => { stdout.push(...decoder.push(data)) })
  child.stderr.on('data', data => stderr.push(data))
  const exited = new Promise<number | null>(resolve => child.once('close', code => resolve(code)))
  return { child, stdout, stderr, exited }
}
async function until(check: () => boolean, maximumMs = 3000): Promise<void> {
  const deadline = Date.now() + maximumMs
  while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  expect(check()).toBe(true)
}

describe('native messaging child process', () => {
  it('authenticates before forwarding Chrome frames and preserves fragmented UTF-8 payloads both ways', async () => {
    const { directory, endpoint } = configuration()
    const received: unknown[] = []
    let appSocket: Socket | undefined
    await listen(endpoint, (message, socket) => { received.push(message); appSocket = socket })
    const running = launch(directory, endpoint)
    const chromeMessage = encodeNativeFrame({ type: 'hello', text: 'Xin chào 👋' })
    running.child.stdin.write(chromeMessage.subarray(0, 3))
    running.child.stdin.write(chromeMessage.subarray(3))
    await until(() => received.length === 1)
    expect(received).toEqual([{ type: 'host_auth', token: TOKEN, origin: ORIGIN }])
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(received).toHaveLength(1)
    appSocket!.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
    await until(() => received.length === 2)
    expect(received[1]).toEqual({ type: 'hello', text: 'Xin chào 👋' })
    const response = encodeNativeFrame({ type: 'hello_result', ok: true, text: '你好' })
    appSocket!.write(response.subarray(0, 2))
    appSocket!.write(response.subarray(2))
    await until(() => running.stdout.length > 0)
    expect(running.stdout).toEqual([{ type: 'hello_result', ok: true, text: '你好' }])
    running.child.stdin.end()
    await running.exited
    expect(Buffer.concat(running.stderr).toString()).toBe('')
  })

  it.each(['chrome-extension://other/', ORIGIN.slice(0, -1), 'https://example.com/'])('rejects caller origin %s before opening app IPC', async origin => {
    const { directory, endpoint } = configuration()
    const received: unknown[] = []
    await listen(endpoint, message => received.push(message))
    const running = launch(directory, endpoint, origin)
    expect(await running.exited).toBe(1)
    expect(received).toEqual([])
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'HOST_ERROR', error: 'Invalid Chrome extension origin' }])
  })

  it('reports app offline through a valid native frame without exposing local paths or credentials', async () => {
    const { directory, endpoint } = configuration()
    const running = launch(directory, endpoint)
    expect(await running.exited).toBe(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'APP_OFFLINE', error: 'BS Coding is not running' }])
    expect(Buffer.concat(running.stderr).toString()).not.toContain(TOKEN)
  })

  it('fails closed when the app rejects helper authentication', async () => {
    const { directory, endpoint } = configuration()
    const received: unknown[] = []
    await listen(endpoint, (message, socket) => { received.push(message); socket.write(encodeNativeFrame({ type: 'host_ready', ok: false, error: TOKEN })) })
    const running = launch(directory, endpoint)
    running.child.stdin.write(encodeNativeFrame({ type: 'hello' }))
    expect(await running.exited).toBe(1)
    expect(received).toHaveLength(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'HOST_ERROR', error: 'Native host authentication failed' }])
  })

  it('rejects oversized announced extension frames and closes the IPC connection', async () => {
    const { directory, endpoint } = configuration()
    await listen(endpoint, (_, socket) => socket.write(encodeNativeFrame({ type: 'host_ready', ok: true })))
    const running = launch(directory, endpoint)
    const prefix = Buffer.alloc(4); prefix.writeUInt32LE(8 * 1024 * 1024 + 1)
    running.child.stdin.write(prefix)
    expect(await running.exited).toBe(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'HOST_ERROR', error: 'Invalid native message' }])
  })

  it('accepts an extension artifact larger than Chrome host-to-extension limits', async () => {
    const { directory, endpoint } = configuration()
    let artifact: unknown
    await listen(endpoint, (message, socket) => {
      if ((message as { type: string }).type === 'host_auth') socket.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
      else artifact = message
    })
    const running = launch(directory, endpoint)
    running.child.stdin.write(encodeNativeFrame({ type: 'result', image: 'x'.repeat(2 * 1024 * 1024) }))
    await until(() => artifact !== undefined)
    expect((artifact as { image: string }).image.length).toBe(2 * 1024 * 1024)
    running.child.stdin.end()
    expect(await running.exited).toBe(0)
  })

  it('never emits a Chrome-bound message larger than 1 MiB', async () => {
    const { directory, endpoint } = configuration()
    await listen(endpoint, (_, socket) => {
      socket.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
      socket.write(encodeNativeFrame({ type: 'cmd', value: 'x'.repeat(1024 * 1024) }))
    })
    const running = launch(directory, endpoint)
    expect(await running.exited).toBe(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'HOST_ERROR', error: 'Invalid app message' }])
  })

  it('exits when the app closes an authenticated IPC connection', async () => {
    const { directory, endpoint } = configuration()
    await listen(endpoint, (_, socket) => { socket.write(encodeNativeFrame({ type: 'host_ready', ok: true })); socket.end() })
    const running = launch(directory, endpoint)
    expect(await running.exited).toBe(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'APP_OFFLINE', error: 'BS Coding connection closed' }])
  })

  it('rejects a truncated Chrome frame at end-of-stream', async () => {
    const { directory, endpoint } = configuration()
    await listen(endpoint, (_, socket) => socket.write(encodeNativeFrame({ type: 'host_ready', ok: true })))
    const running = launch(directory, endpoint)
    running.child.stdin.end(Buffer.from([10, 0]))
    expect(await running.exited).toBe(1)
    expect(running.stdout).toEqual([{ type: 'host_status', code: 'HOST_ERROR', error: 'Invalid native message' }])
  })

  it('terminates after Chrome closes input even when Chrome has stopped reading a large output frame', async () => {
    const { directory, endpoint } = configuration()
    let authenticated = false
    await listen(endpoint, (_, socket) => {
      socket.write(encodeNativeFrame({ type: 'host_ready', ok: true }))
      socket.write(encodeNativeFrame({ type: 'cmd', value: 'x'.repeat(800000) }))
      authenticated = true
    })
    const running = launch(directory, endpoint)
    running.child.stdout.pause()
    await until(() => authenticated)
    const exitEvent = new Promise<number | null>(resolve => running.child.once('exit', resolve))
    running.child.stdin.end()
    const result = await Promise.race([exitEvent, new Promise<string>(resolve => setTimeout(() => resolve('host remained alive'), 1800))])
    running.child.stdout.resume()
    expect(result).not.toBe('host remained alive')
    // Depending on pipe scheduling the small pending write may drain before
    // the deadline; either a clean exit or the bounded self-kill is valid.
    expect([0, process.platform === 'win32' ? 1 : null]).toContain(result)
    if (result !== 0 && process.platform !== 'win32') expect(running.child.signalCode).toBe('SIGKILL')
    await running.exited
  })
})
