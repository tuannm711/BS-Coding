import { describe, expect, it, vi, afterEach } from 'vitest'
import { createDebugSession } from '../../../src/browser-extension/debug-session'
import type { ChromeDebuggerLike } from '../../../src/browser-extension/debug-session'

function fakeDbg(): ChromeDebuggerLike & { attach: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn>; sendCommand: ReturnType<typeof vi.fn> } {
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue({})
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createDebugSession', () => {
  it('closes a hung attachment and prevents its late completion from claiming new session state', async () => {
    vi.useFakeTimers()
    const dbg = fakeDbg()
    let release!: () => void
    dbg.attach.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const session = createDebugSession(dbg)
    const first = session.ensure(10)
    const rejected = expect(first).rejects.toThrow(/DETACHED|cancelled/)
    await Promise.resolve(); await Promise.resolve()
    await session.close()
    await rejected
    await session.ensure(20)
    release()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(session.attachedTabId()).toBe(20)
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 10 })
  })

  it('bounds hung detach and permits subsequent attachment after quarantine', async () => {
    vi.useFakeTimers()
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await session.ensure(10)
    dbg.detach.mockImplementationOnce(() => new Promise(() => {}))
    const closing = session.close()
    await vi.advanceTimersByTimeAsync(1001)
    await closing
    await session.ensure(20)
    expect(session.attachedTabId()).toBe(20)
  })

  it.each(['attach', 'enable'] as const)('bounds hung %s setup without waiting for a command cancellation', async stage => {
    vi.useFakeTimers()
    const dbg = fakeDbg()
    if (stage === 'attach') dbg.attach.mockImplementationOnce(() => new Promise(() => {}))
    else dbg.sendCommand.mockImplementationOnce(() => new Promise(() => {}))
    const session = createDebugSession(dbg)
    const pending = session.ensure(10)
    const rejected = expect(pending).rejects.toThrow('DEBUGGER_TIMEOUT')
    await vi.advanceTimersByTimeAsync(5001)
    await rejected
    expect(session.attachedTabId()).toBeNull()
    await session.ensure(20)
    expect(session.attachedTabId()).toBe(20)
  })

  it('attaches once and enables scoped CDP observation domains', async () => {
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await session.ensure(10)
    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.attach).toHaveBeenCalledWith({ tabId: 10 }, '1.3')
    expect(dbg.sendCommand.mock.calls.map(c => c[1])).toEqual([
      'DOM.enable', 'Page.enable', 'Runtime.enable', 'Accessibility.enable', 'Network.enable'
    ])
    expect(session.attachedTabId()).toBe(10)
  })

  it('does not re-attach when ensuring the same tab', async () => {
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await session.ensure(10)
    await session.ensure(10)
    expect(dbg.attach).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent ensure calls', async () => {
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await Promise.all([session.ensure(10), session.ensure(10)])
    expect(dbg.attach).toHaveBeenCalledTimes(1)
  })

  it('serializes close with ensure', async () => {
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await session.ensure(10)
    await Promise.all([session.close(), session.ensure(20)])
    expect(dbg.attach).toHaveBeenLastCalledWith({ tabId: 20 }, '1.3')
    expect(session.attachedTabId()).toBe(20)
  })

  it('closes the previous tab before attaching a new one', async () => {
    const dbg = fakeDbg()
    const session = createDebugSession(dbg)
    await session.ensure(10)
    await session.ensure(20)
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 10 })
    expect(dbg.attach).toHaveBeenLastCalledWith({ tabId: 20 }, '1.3')
    expect(session.attachedTabId()).toBe(20)
  })

  it('close detaches and clears state; detach failure is swallowed', async () => {
    const dbg = fakeDbg()
    dbg.detach.mockRejectedValueOnce(new Error('no session'))
    const session = createDebugSession(dbg)
    await session.ensure(10)
    await session.close()
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 10 })
    expect(session.attachedTabId()).toBeNull()
  })

  it('closes itself after the idle timeout', async () => {
    vi.useFakeTimers()
    const dbg = fakeDbg()
    const session = createDebugSession(dbg, 1000)
    await session.ensure(10)
    expect(dbg.detach).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1001)
    await Promise.resolve()
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 10 })
  })

  it('cleans up the attach when enabling a domain fails', async () => {
    const dbg = fakeDbg()
    dbg.sendCommand.mockRejectedValueOnce(new Error('boom'))
    const session = createDebugSession(dbg)
    await expect(session.ensure(10)).rejects.toThrow('boom')
    expect(dbg.detach).toHaveBeenCalledWith({ tabId: 10 })
    expect(session.attachedTabId()).toBeNull()
  })

  it('does not let a stale idle timer from a previous tab detach the new one', async () => {
    vi.useFakeTimers()
    const dbg = fakeDbg()
    const session = createDebugSession(dbg, 1000)
    await session.ensure(10)
    vi.advanceTimersByTime(900)
    await session.ensure(20)
    vi.advanceTimersByTime(200)
    expect(dbg.detach).not.toHaveBeenCalledWith({ tabId: 20 })
    expect(session.attachedTabId()).toBe(20)
  })
})
