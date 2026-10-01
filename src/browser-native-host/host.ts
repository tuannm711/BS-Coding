import { createWriteStream, readFileSync } from 'node:fs'
import { createConnection, type Socket } from 'node:net'
import path from 'node:path'
import type { Writable } from 'node:stream'
import { NativeFrameDecoder, encodeNativeFrame } from '../main/browser/native-framing'
import { NATIVE_EXTENSION_ID } from '../shared/browser-native'

const EXTENSION_LIMIT = 8 * 1024 * 1024
const CHROME_OUTPUT_LIMIT = 1024 * 1024
const EXPECTED_ORIGIN = `chrome-extension://${NATIVE_EXTENSION_ID}/`
// Windows process.stdout pipe writes can block the event loop. Asynchronous
// fd writes keep input closure and shutdown deadlines responsive.
const nativeOutput = createWriteStream('', { fd: 1, autoClose: false })
let socket: Socket | undefined
let stopped = false
let ready = false
let handshakeTimer: NodeJS.Timeout | undefined

// Each complete frame is one write. Waiting for its callback propagates stream
// backpressure to the source instead of accumulating unbounded message queues.
function writeFrame(destination: Writable, value: unknown, maximum: number): Promise<void> {
  const frame = encodeNativeFrame(value, maximum)
  return new Promise((resolve, reject) => destination.write(frame, error => error ? reject(error) : resolve()))
}

function stop(code: number, status?: { code: 'APP_OFFLINE' | 'HOST_ERROR'; error: string }): void {
  if (stopped) return
  stopped = true
  clearTimeout(handshakeTimer)
  socket?.destroy()
  process.stdin.destroy()
  process.exitCode = code
  // Chrome can close input while no longer draining its stdout pipe. Shutdown
  // must still release the helper instead of waiting forever on that consumer.
  // process.exit can wait on a blocked Windows stdio write during libuv cleanup.
  // An OS termination after the drain deadline closes that write immediately.
  const deadline = setTimeout(() => process.kill(process.pid, 'SIGKILL'), 1000)
  deadline.unref()
  if (!status) { nativeOutput.end(() => { clearTimeout(deadline); process.exit(code) }); return }
  // Error strings are fixed safe descriptions; OS errors and credentials never
  // enter Chrome output or diagnostic logs.
  const frame = encodeNativeFrame({ type: 'host_status', ...status }, CHROME_OUTPUT_LIMIT)
  nativeOutput.end(frame, () => { clearTimeout(deadline); process.exit(code) })
}

async function forwardChromeInput(app: Socket): Promise<void> {
  const decoder = new NativeFrameDecoder(EXTENSION_LIMIT)
  try {
    for await (const chunk of process.stdin) {
      for (const value of decoder.push(Buffer.from(chunk))) {
        if (stopped) return
        await writeFrame(app, value, EXTENSION_LIMIT)
      }
    }
    decoder.finish()
    stop(0)
  } catch { if (!stopped) stop(1, { code: 'HOST_ERROR', error: 'Invalid native message' }) }
}

async function readAppOutput(app: Socket): Promise<void> {
  const decoder = new NativeFrameDecoder(CHROME_OUTPUT_LIMIT)
  try {
    for await (const chunk of app) {
      for (const value of decoder.push(Buffer.from(chunk))) {
        if (stopped) return
        if (!ready) {
          const message = value as Record<string, unknown>
          if (message.type !== 'host_ready' || message.ok !== true) {
            stop(1, { code: 'HOST_ERROR', error: 'Native host authentication failed' })
            return
          }
          ready = true
          clearTimeout(handshakeTimer)
          void forwardChromeInput(app)
        } else await writeFrame(nativeOutput, value, CHROME_OUTPUT_LIMIT)
      }
    }
    decoder.finish()
    stop(1, { code: 'APP_OFFLINE', error: 'BS Coding connection closed' })
  } catch {
    if (!stopped) stop(1, { code: 'HOST_ERROR', error: 'Invalid app message' })
  }
}

function start(): void {
  if (process.argv[2] !== EXPECTED_ORIGIN) {
    stop(1, { code: 'HOST_ERROR', error: 'Invalid Chrome extension origin' })
    return
  }
  let config: { endpoint: string; token: string; extensionId: string }
  try {
    config = JSON.parse(readFileSync(path.join(__dirname, 'connection.json'), 'utf8'))
    if (!config || config.extensionId !== NATIVE_EXTENSION_ID || typeof config.token !== 'string' || !/^[0-9a-f]{64}$/.test(config.token) || typeof config.endpoint !== 'string') throw new Error('Invalid config')
    if (process.platform === 'win32' ? !config.endpoint.startsWith('\\\\.\\pipe\\') : !path.isAbsolute(config.endpoint)) throw new Error('Invalid endpoint')
  } catch { stop(1, { code: 'HOST_ERROR', error: 'Native host configuration is invalid' }); return }
  socket = createConnection(config.endpoint)
  socket.once('error', () => {
    if (!stopped) stop(1, { code: 'APP_OFFLINE', error: ready ? 'BS Coding connection closed' : 'BS Coding is not running' })
  })
  handshakeTimer = setTimeout(() => stop(1, { code: 'APP_OFFLINE', error: 'BS Coding connection timed out' }), 5000)
  socket.once('connect', () => {
    if (stopped || !socket) return
    void writeFrame(socket, { type: 'host_auth', token: config.token, origin: EXPECTED_ORIGIN }, EXTENSION_LIMIT).catch(() => stop(1, { code: 'APP_OFFLINE', error: 'BS Coding connection closed' }))
    void readAppOutput(socket)
  })
}

nativeOutput.on('error', () => { if (!stopped) stop(1) })
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))
start()
