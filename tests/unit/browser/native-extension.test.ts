import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeExtensionTransport, type NativePortLike } from '../../../src/browser-extension/native-transport'
import type { NativeCommand, NativeExtensionMessage } from '../../../src/shared/browser-native'

function port() {
  const sent: NativeExtensionMessage[] = []
  let listener: (message: unknown) => void = () => {}
  let disconnected: () => void = () => {}
  const value: NativePortLike = {
    postMessage: message => { sent.push(message) }, disconnect: () => disconnected(),
    onMessage: { addListener: fn => { listener = fn } }, onDisconnect: { addListener: fn => { disconnected = fn } }
  }
  return { value, sent, receive: (message: unknown) => listener(message), drop: () => disconnected() }
}

const hello = { clientId: 'fixture-client', browserEpoch: 'browser-epoch', extensionVersion: '1.0.0', label: 'Chrome fixture' }
const command = (patch: Partial<NativeCommand> = {}): NativeCommand => ({ type: 'cmd', id: 'one', epoch: 'app-epoch', ownerId: 'session-a', deadline: 100, name: 'read', ...patch })
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
afterEach(() => vi.useRealTimers())

describe('native extension transport', () => {
  it('negotiates version and identity before accepting commands', async () => {
    const client = port()
    const executed: string[] = []
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async c => { executed.push(c.id); return { ok: true } } })
    transport.attach(client.value)
    expect(client.sent[0]).toMatchObject({ type: 'hello', protocolVersion: 1, clientId: 'fixture-client', browserEpoch: 'browser-epoch', capabilities: ['session-tabs', 'snapshot-generation', 'cdp-events'] })
    client.receive(command())
    await settle()
    expect(executed).toEqual([])
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command({ id: 'accepted' }))
    await settle()
    expect(executed).toEqual(['accepted'])
    expect(client.sent.at(-1)).toMatchObject({ type: 'result', id: 'accepted', ownerId: 'session-a', epoch: 'app-epoch', ok: true })
  })

  it('serializes whole commands and drops expired queued actions', async () => {
    let now = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const order: string[] = []
    const client = port()
    const transport = new NativeExtensionTransport({ hello, now: () => now, execute: async c => {
      order.push(c.id)
      if (c.id === 'one') await gate
      return { ok: true }
    } })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command())
    client.receive(command({ id: 'two', name: 'click' }))
    await settle()
    expect(order).toEqual(['one'])
    now = 101
    release()
    await settle()
    expect(order).toEqual(['one'])
    expect(client.sent.at(-1)).toMatchObject({ id: 'two', ok: false, error: expect.stringContaining('deadline') })
  })

  it('never executes queued old commands or replies through a new connection', async () => {
    const old = port(), next = port()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const actions: string[] = []
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async (c, context) => {
      if (c.id === 'one') await gate
      context.assertActive()
      actions.push(c.id)
      return { ok: true }
    } })
    transport.attach(old.value)
    old.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    old.receive(command())
    old.receive(command({ id: 'old-queued', name: 'click' }))
    await settle()
    old.drop()
    transport.attach(next.value)
    next.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'new-epoch' })
    release()
    await settle()
    expect(actions).toEqual([])
    expect(next.sent.filter(message => message.type === 'result')).toEqual([])
    expect(old.sent.filter(message => message.type === 'result')).toEqual([])
  })

  it('rejects wrong epochs, unknown commands and duplicate mutations', async () => {
    const client = port()
    const executed: string[] = []
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async c => { executed.push(c.id); return { ok: true } } })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command({ epoch: 'old', id: 'wrong' }))
    client.receive({ ...command(), name: 'shell' })
    client.receive(command({ id: 'click', name: 'click' }))
    client.receive(command({ id: 'click', name: 'click' }))
    await settle()
    expect(executed).toEqual(['click'])
  })

  it('cancels an active command by quarantining its epoch before the next action boundary', async () => {
    const client = port()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const actions: string[] = []
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async (c, context) => {
      await gate
      context.assertActive()
      actions.push(c.id)
      return { ok: true }
    } })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command())
    client.receive(command({ id: 'queued', name: 'click' }))
    await settle()
    client.receive({ type: 'cancel', id: 'one', epoch: 'app-epoch' })
    client.receive({ type: 'cancel', id: 'queued', epoch: 'app-epoch' })
    release()
    await settle()
    expect(actions).toEqual([])
    expect(transport.connectionStatus()).toMatchObject({ connected: false })
    expect(client.sent.filter(message => message.type === 'result')).toEqual([])
  })

  it('disconnects a hung execution at its deadline and releases the queue only after epoch invalidation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const old = port(), next = port()
    const disconnected = vi.fn()
    const actions: string[] = []
    let abandonedContext: { assertActive(): void } | undefined
    const transport = new NativeExtensionTransport({ hello, execute: async (c, context) => {
      actions.push(c.id)
      if (c.id === 'hung') { abandonedContext = context; return new Promise(() => {}) }
      return { ok: true }
    }, onDisconnect: disconnected })
    transport.attach(old.value)
    old.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    old.receive(command({ id: 'hung' }))
    old.receive(command({ id: 'old-queued', name: 'click', deadline: 10000 }))
    await settle()
    await vi.advanceTimersByTimeAsync(100)
    expect(transport.connectionStatus()).toMatchObject({ connected: false })
    expect(disconnected).toHaveBeenCalledTimes(1)
    expect(actions).toEqual(['hung'])
    expect(() => abandonedContext?.assertActive()).toThrow('epoch')
    transport.attach(next.value)
    next.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'new-epoch' })
    next.receive(command({ id: 'next', epoch: 'new-epoch', deadline: 10000 }))
    await settle()
    expect(actions).toEqual(['hung', 'next'])
  })

  it('cancels a queued command without disconnecting the active execution', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const client = port()
    const actions: string[] = []
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async c => { actions.push(c.id); await gate; return { ok: true } } })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command())
    client.receive(command({ id: 'queued', name: 'click' }))
    await settle()
    client.receive({ type: 'cancel', id: 'queued', epoch: 'app-epoch' })
    release()
    await settle()
    expect(transport.connectionStatus()).toMatchObject({ connected: true })
    expect(actions).toEqual(['one'])
    expect(client.sent.at(-1)).toMatchObject({ id: 'queued', ok: false, error: expect.stringContaining('CANCELLED') })
  })

  it('rejects command deadlines beyond the maximum execution window', async () => {
    const client = port(), execute = vi.fn(async (): Promise<{ ok: true }> => ({ ok: true }))
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command({ deadline: 120001 }))
    await settle()
    expect(execute).not.toHaveBeenCalled()
    expect(client.sent.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining('DEADLINE_INVALID') })
  })

  it('rejects oversized screenshots before sending native messages', async () => {
    const client = port()
    const transport = new NativeExtensionTransport({ hello, now: () => 0, execute: async () => ({ ok: true, data: { base64: 'a'.repeat(8 * 1024 * 1024) } }) })
    transport.attach(client.value)
    client.receive({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'app-epoch' })
    client.receive(command({ name: 'screenshot' }))
    await settle()
    expect(client.sent.at(-1)).toMatchObject({ type: 'result', ok: false, error: expect.stringContaining('MESSAGE_TOO_LARGE') })
  })
})
