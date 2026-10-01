import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import { BrowserService } from '../../../src/main/browser/service'
import { NativeFrameDecoder, encodeNativeFrame } from '../../../src/main/browser/native-framing'
import { NATIVE_EXTENSION_ID } from '../../../src/shared/browser-native'

const services: BrowserService[] = []
const sockets: net.Socket[] = []
const roots: string[] = []
afterEach(async () => { sockets.splice(0).forEach(socket => socket.destroy()); await Promise.all(services.splice(0).map(service => service.close())); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })) })

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-native-service-')); roots.push(root)
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\bs-native-test-${randomUUID()}` : path.join(root, 'browser.sock')
  const deps = { endpoint, token: 'fixture-private-token', extensionId: NATIVE_EXTENSION_ID, screenshotDir: root, snapshotDir: root, stateFile: path.join(root, 'browser-state.json') }
  const service = new BrowserService(deps)
  services.push(service); await service.start()
  return { service, endpoint, deps }
}
async function client(endpoint: string, id = 'client-1', token = 'fixture-private-token') {
  const socket = net.createConnection(endpoint); sockets.push(socket)
  const received: any[] = []
  const decoder = new NativeFrameDecoder()
  socket.on('data', data => received.push(...decoder.push(Buffer.isBuffer(data) ? data : Buffer.from(data))))
  socket.on('error', () => {})
  await new Promise<void>(resolve => socket.once('connect', resolve))
  const send = (message: unknown) => socket.write(encodeNativeFrame(message))
  send({ type: 'host_auth', token, origin: `chrome-extension://${NATIVE_EXTENSION_ID}/` })
  await vi.waitFor(() => expect(received).toHaveLength(1))
  if (received[0].ok) {
    send({ type: 'hello', protocolVersion: 1, clientId: id, browserEpoch: 'browser-epoch', extensionVersion: '1.0.0', label: id, capabilities: ['session-tabs', 'snapshot-generation', 'cdp-events'] })
    await vi.waitFor(() => expect(received).toHaveLength(2))
  }
  return { socket, received, send, epoch: received.at(-1)?.epoch as string }
}

describe('native BrowserService', () => {
  it('keeps a disabled profile blocked across reconnect until explicitly enabled', async () => {
    const { service, endpoint } = await fixture()
    const connected = await client(endpoint, 'disabled-profile')
    service.setConnectionEnabled('disabled-profile', false)
    await vi.waitFor(() => expect(connected.socket.destroyed).toBe(true))
    const blocked = await client(endpoint, 'disabled-profile')
    expect(blocked.received.at(-1)).toMatchObject({ ok: false, error: expect.stringMatching(/disabled/i) })
    service.setConnectionEnabled('disabled-profile', true)
    const next = await client(endpoint, 'disabled-profile')
    expect(next.received.at(-1)?.ok).toBe(true)
  })
  it('retains the selected profile and session bindings through an app restart', async () => {
    const { service, endpoint, deps } = await fixture()
    await client(endpoint, 'first')
    const second = await client(endpoint, 'second')
    service.selectConnection('second')
    const opened = service.execute('openTab', { url: 'https://example.com' }, 1000, { ownerId: 'owned-session' })
    await vi.waitFor(() => expect(second.received.at(-1)?.type).toBe('cmd'))
    const cmd = second.received.at(-1)
    second.send({ type: 'result', id: cmd.id, epoch: second.epoch, ownerId: 'owned-session', ok: true, data: { tabId: 7 } }); await opened
    await service.close()
    const restored = new BrowserService(deps); services.push(restored); await restored.start()
    await client(endpoint, 'first')
    expect(restored.getStatus().selectedConnectionId).toBe('second')
    expect(restored.getStatus().paired).toBe(false)
    const nextSecond = await client(endpoint, 'second')
    restored.selectConnection('first')
    const read = restored.execute('read', {}, 1000, { ownerId: 'owned-session' })
    await vi.waitFor(() => expect(nextSecond.received.at(-1)?.name).toBe('read'))
    const readCommand = nextSecond.received.at(-1)
    nextSecond.send({ type: 'result', id: readCommand.id, epoch: nextSecond.epoch, ownerId: 'owned-session', ok: true, data: 'correct profile' })
    expect(await read).toEqual({ ok: true, data: 'correct profile' })
  })
  it('rejects incompatible extension protocol and foreign origins', async () => {
    const { service, endpoint } = await fixture()
    const c = await client(endpoint)
    const socket = net.createConnection(endpoint); sockets.push(socket)
    socket.on('error', () => {})
    const frames: any[] = []; const decoder = new NativeFrameDecoder()
    socket.on('data', data => frames.push(...decoder.push(Buffer.from(data))))
    await new Promise<void>(resolve => socket.once('connect', resolve))
    socket.write(encodeNativeFrame({ type: 'host_auth', token: 'fixture-private-token', origin: 'chrome-extension://other/' }))
    await vi.waitFor(() => expect(frames[0]?.ok).toBe(false))
    expect(service.getStatus().paired).toBe(true)
    expect(c.socket.destroyed).toBe(false)
  })
  it('rejects unauthenticated helpers without disconnecting an active profile', async () => {
    const { service, endpoint } = await fixture()
    const good = await client(endpoint)
    const bad = await client(endpoint, 'intruder', 'wrong-token')
    expect(bad.received[0].ok).toBe(false)
    expect(service.getStatus().paired).toBe(true)
    expect(good.socket.destroyed).toBe(false)
  })
  it('binds commands/results to the selected profile, epoch and owning session', async () => {
    const { service, endpoint } = await fixture()
    const first = await client(endpoint, 'first'); const second = await client(endpoint, 'second')
    service.selectConnection('second')
    const result = service.execute('openTab', { url: 'https://example.com' }, 1000, { ownerId: 'session-a' })
    await vi.waitFor(() => expect(second.received.at(-1)?.type).toBe('cmd'))
    const cmd = second.received.at(-1)
    first.send({ type: 'result', id: cmd.id, epoch: first.epoch, ownerId: 'session-a', ok: true, data: 'wrong profile' })
    second.send({ type: 'result', id: cmd.id, epoch: second.epoch, ownerId: 'another-session', ok: true, data: 'wrong session' })
    second.send({ type: 'result', id: cmd.id, epoch: second.epoch, ownerId: 'session-a', ok: true, data: { tabId: 7 } })
    expect(await result).toEqual({ ok: true, data: { tabId: 7 } })
    service.selectConnection('first')
    const next = service.execute('read', {}, 1000, { ownerId: 'session-a' })
    await vi.waitFor(() => expect(second.received.at(-1)?.name).toBe('read'))
    second.socket.destroy()
    expect(await next).toMatchObject({ ok: false, error: expect.stringMatching(/RESULT_UNKNOWN|disconnect/i) })
  })
  it('times out and cancels sent commands without replaying them', async () => {
    const { service, endpoint } = await fixture(); const c = await client(endpoint)
    expect(await service.execute('click', { ref: 'snapshot:r1' }, 20, { ownerId: 'a' })).toMatchObject({ ok: false, error: expect.stringMatching(/RESULT_UNKNOWN|timed out/i) })
    const controller = new AbortController()
    const pending = service.execute('type', { text: 'one send' }, 1000, { ownerId: 'a', signal: controller.signal })
    controller.abort()
    expect(await pending).toMatchObject({ ok: false })
    expect(c.received.filter(message => message.name === 'click')).toHaveLength(1)
    await vi.waitFor(() => expect(c.received.filter(message => message.type === 'cancel')).toHaveLength(2))
  })
})
