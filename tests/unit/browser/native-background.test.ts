/// <reference types="chrome" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeCommand } from '../../../src/shared/browser-native'

function event<T extends (...args: any[]) => unknown>() {
  const listeners: T[] = []
  return { addListener: (fn: T) => listeners.push(fn), fire: (...args: Parameters<T>) => listeners.forEach(fn => fn(...args)) }
}
const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }

function stubChrome() {
  const messages: any[] = []
  const onMessage = event(), onDisconnect = event()
  const tabs = new Map([[10, { id: 10, active: true, url: 'https://fixture.test/a' }], [20, { id: 20, active: false, url: 'https://fixture.test/b' }]])
  const session: Record<string, unknown> = {}
  const local: Record<string, unknown> = {}
  const storage = (data: Record<string, unknown>) => ({ get: async () => data, set: async (patch: Record<string, unknown>) => { Object.assign(data, patch) } })
  const debuggerEvents = event(), debuggerDetach = event()
  const chrome = {
    storage: { local: storage(local), session: storage(session) },
    runtime: { getManifest: () => ({ version: '1.0.0' }), sendMessage: vi.fn(async () => undefined), onMessage: event(), onInstalled: event(), onStartup: event(),
      connectNative: vi.fn(() => ({ postMessage: (message: unknown) => messages.push(message), disconnect: () => {}, onMessage, onDisconnect })) },
    alarms: { create: vi.fn(async () => {}), onAlarm: event() }, tabGroups: { query: async () => [], update: async () => ({}) },
    tabs: {
      get: vi.fn(async (id: number) => { const tab = tabs.get(id); if (!tab) throw Error('missing'); return tab }),
      query: vi.fn(async () => [...tabs.values()]), create: vi.fn(async ({ url, active }: { url: string; active: boolean }) => { const tab = { id: 30, url, active }; tabs.set(30, tab); return tab }),
      update: vi.fn(async (id: number, change: object) => Object.assign(tabs.get(id)!, change)), remove: vi.fn(async (id: number) => { tabs.delete(id) }), reload: vi.fn(async () => {}), group: vi.fn(async () => 1),
      sendMessage: vi.fn(async () => ({ ok: true })), onRemoved: event(), onUpdated: event()
    },
    scripting: { executeScript: vi.fn(async () => []) },
    debugger: {
      attach: vi.fn(async () => {}), detach: vi.fn(async ({ tabId }: { tabId: number }) => debuggerDetach.fire({ tabId })), onEvent: debuggerEvents, onDetach: debuggerDetach,
      sendCommand: vi.fn(async (_tab: unknown, method: string) => {
        if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame' } } }
        if (method === 'Accessibility.getFullAXTree') return { nodes: [{ nodeId: 'root', role: { value: 'RootWebArea' }, childIds: ['button'] }, { nodeId: 'button', backendDOMNodeId: 7, role: { value: 'button' }, name: { value: 'Click fixture' } }] }
        if (method === 'DOM.resolveNode') return { object: { objectId: 'object' } }
        return {}
      })
    }
  }
  return { chrome, messages, onMessage, session, debuggerEvents }
}

describe('native extension background session routing', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.resetModules() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  async function start() {
    const stub = stubChrome()
    vi.stubGlobal('chrome', stub.chrome)
    await import('../../../src/browser-extension/background')
    await settle()
    expect(stub.chrome.runtime.connectNative).toHaveBeenCalledWith('com.bscoding.browser')
    stub.onMessage.fire({ type: 'hello_result', ok: true, protocolVersion: 1, epoch: 'epoch' })
    const command = async (name: NativeCommand['name'], ownerId: string, params: Record<string, unknown> = {}) => {
      const id = `request-${stub.messages.length}`
      stub.onMessage.fire({ type: 'cmd', id, epoch: 'epoch', ownerId, deadline: Date.now() + 30000, name, params })
      await settle()
      return stub.messages.find(message => message.type === 'result' && message.id === id)
    }
    return { ...stub, command }
  }

  it('refuses unassigned reads and other-session mutations without using the active user tab', async () => {
    const stub = await start()
    expect(await stub.command('read', 'a')).toMatchObject({ ok: false, error: expect.stringContaining('TAB_UNASSIGNED') })
    expect(stub.chrome.debugger.attach).not.toHaveBeenCalled()
    expect(await stub.command('claimTab', 'a', { tabId: 10 })).toMatchObject({ ok: true })
    expect(await stub.command('closeTab', 'b', { tabId: 10 })).toMatchObject({ ok: false })
    expect(stub.chrome.tabs.remove).not.toHaveBeenCalled()
    expect(stub.session.sessionTabs).toEqual({ version: 2, defaults: { a: 10 }, leases: { '10': 'a' } })
  })

  it('returns generation refs and invalidates them after navigation', async () => {
    const stub = await start()
    await stub.command('claimTab', 'a', { tabId: 10 })
    const read = await stub.command('read', 'a')
    expect(read).toMatchObject({ ok: true, data: { tabId: 10, snapshotId: expect.any(String) } })
    const ref = read.data.tree[0].children[0].ref
    expect(ref).toBe(`${read.data.snapshotId}:r1`)
    expect(await stub.command('click', 'a', { ref })).toMatchObject({ ok: true })
    stub.chrome.tabs.onUpdated.fire(10, { status: 'loading' })
    expect(await stub.command('click', 'a', { ref })).toMatchObject({ ok: false, error: expect.stringContaining('STALE_SNAPSHOT') })
  })

  it('opens a background session tab and scopes only attached CDP events', async () => {
    const stub = await start()
    await stub.command('navigate', 'a', { url: 'https://fixture.test/new' })
    expect(stub.chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://fixture.test/new', active: false })
    await stub.command('read', 'a')
    stub.debuggerEvents.fire({ tabId: 10 }, 'Runtime.consoleAPICalled', { args: [{ value: 'unowned' }] })
    stub.debuggerEvents.fire({ tabId: 30 }, 'Runtime.consoleAPICalled', { args: [{ value: 'owned' }] })
    const logged = await stub.command('getConsoleLogs', 'a')
    expect(logged.data).toEqual([expect.objectContaining({ text: 'owned' })])
    expect(stub.messages.filter(message => message.type === 'event' && message.name === 'console')).toEqual([expect.objectContaining({ ownerId: 'a', data: expect.objectContaining({ text: 'owned' }) })])
  })

  it('waits for debugger teardown before reconnecting after a hung command is cancelled', async () => {
    const stub = await start()
    await stub.command('claimTab', 'a', { tabId: 10 })
    let releaseDetach!: () => void
    const detached = new Promise<void>(resolve => { releaseDetach = resolve })
    stub.chrome.debugger.detach.mockImplementation(async () => { await detached })
    const original = stub.chrome.debugger.sendCommand.getMockImplementation()!
    stub.chrome.debugger.sendCommand.mockImplementation(async (tab, method) => {
      if (method === 'Runtime.evaluate') return new Promise(() => {})
      return original(tab, method)
    })
    stub.onMessage.fire({ type: 'cmd', id: 'hung-read', epoch: 'epoch', ownerId: 'a', deadline: Date.now() + 30000, name: 'read' })
    await settle()
    stub.onMessage.fire({ type: 'cancel', id: 'hung-read', epoch: 'epoch' })
    await settle()
    expect(stub.chrome.debugger.detach).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(999)
    expect(stub.chrome.runtime.connectNative).toHaveBeenCalledTimes(1)
    releaseDetach()
    await settle()
    await vi.advanceTimersByTimeAsync(2)
    expect(stub.chrome.runtime.connectNative).toHaveBeenCalledTimes(2)
  })
})
