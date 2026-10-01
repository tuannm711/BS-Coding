export interface DebuggeeLike { tabId?: number }
export interface ChromeDebuggerLike {
  attach(target: DebuggeeLike, requiredVersion: string): Promise<void>
  detach(target: DebuggeeLike): Promise<void>
  sendCommand(target: DebuggeeLike, method: string, commandParams?: object): Promise<unknown>
}
export interface DebugSession {
  ensure(tabId: number): Promise<void>
  close(): Promise<void>
  attachedTabId(): number | null
}

function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('DEBUGGER_TIMEOUT: Chrome debugger did not respond')), timeoutMs) })
  ]).finally(() => clearTimeout(timer))
}

export function createDebugSession(dbg: ChromeDebuggerLike, idleMs = 60_000): DebugSession {
  let debugTabId: number | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> = Promise.resolve()
  let generation = 0
  let cancelSetup: ((error: Error) => void) | null = null

  const detach = (tabId: number): Promise<void> => bounded(dbg.detach({ tabId }), 1000).catch(() => {})
  const closeRaw = async (): Promise<void> => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    const previous = debugTabId
    debugTabId = null
    if (previous !== null) await detach(previous)
  }
  const close = async (): Promise<void> => {
    generation++
    cancelSetup?.(new Error('DEBUGGER_DETACHED: debugger setup cancelled'))
    const run = inFlight.then(closeRaw)
    inFlight = run.catch(() => {})
    await run
  }
  const resetIdle = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { void close() }, idleMs)
  }
  const ensure = async (tabId: number): Promise<void> => {
    const requestedGeneration = generation
    const run = inFlight.then(async () => {
      const assertGeneration = (): void => {
        if (requestedGeneration !== generation) throw new Error('DEBUGGER_DETACHED: debugger generation changed')
      }
      assertGeneration()
      if (debugTabId === tabId) { resetIdle(); return }
      await closeRaw()
      assertGeneration()
      let abandoned = false
      const cancelled = new Promise<never>((_resolve, reject) => { cancelSetup = reject })
      try {
        const attaching = dbg.attach({ tabId }, '1.3')
        // Chrome can resolve an attachment after cancellation/timeout. It must
        // never claim this session's state; detach that abandoned tab instead.
        void attaching.then(() => {
          if (abandoned || requestedGeneration !== generation) void detach(tabId)
        }).catch(() => {})
        await Promise.race([bounded(attaching, 5000), cancelled])
        assertGeneration()
        await Promise.race([bounded(Promise.all([
          dbg.sendCommand({ tabId }, 'DOM.enable'),
          dbg.sendCommand({ tabId }, 'Page.enable'),
          dbg.sendCommand({ tabId }, 'Runtime.enable'),
          dbg.sendCommand({ tabId }, 'Accessibility.enable'),
          dbg.sendCommand({ tabId }, 'Network.enable')
        ]), 5000), cancelled])
        assertGeneration()
        debugTabId = tabId
        resetIdle()
      } catch (error) {
        abandoned = true
        await detach(tabId)
        throw error
      } finally { cancelSetup = null }
    })
    inFlight = run.catch(() => {})
    await run
  }
  return { ensure, close, attachedTabId: () => debugTabId }
}
