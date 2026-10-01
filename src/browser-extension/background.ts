import type { BrowserCommandResult } from '../shared/browser-types'
import type { NativeCommand } from '../shared/browser-native'
import { NATIVE_HOST_NAME } from '../shared/browser-native'
import { NativeExtensionTransport, type NativeActionContext, type NativeConnectionStatus } from './native-transport'
import { SessionTabs } from './session-tabs'
import { SessionSnapshots } from './session-snapshots'
import { SessionCdpEvents } from './cdp-events'
import { createDebugSession } from './debug-session'
import { axTreeToSnapshot, mergeFrameAxTrees, type AxFrameBundle, type AxNodeLike } from './ax-snapshot'

const STORAGE_KEY = 'bsNativeBrowser'
const ALARM_NAME = 'bs-native-reconnect'
const debugSession = createDebugSession(chrome.debugger)
const snapshots = new SessionSnapshots()
const logs = new SessionCdpEvents()
let sessions = new SessionTabs()
let transport: NativeExtensionTransport | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let nativeConnected = false
let debuggerTeardown: Promise<void> = Promise.resolve()
let initialized: Promise<void> | null = null
let clientId = ''
let browserEpoch = ''
let label = 'Chrome'

async function initialize(): Promise<void> {
  if (initialized) return initialized
  initialized = (async () => {
    const [local, session] = await Promise.all([chrome.storage.local.get(STORAGE_KEY), chrome.storage.session.get(['browserEpoch', 'sessionTabs'])])
    const saved = local[STORAGE_KEY] as { clientId?: string; label?: string } | undefined
    clientId = typeof saved?.clientId === 'string' && saved.clientId ? saved.clientId : crypto.randomUUID()
    label = typeof saved?.label === 'string' && saved.label.trim() ? saved.label.slice(0, 80) : 'Chrome'
    browserEpoch = typeof session.browserEpoch === 'string' && session.browserEpoch ? session.browserEpoch : crypto.randomUUID()
    sessions = new SessionTabs(session.sessionTabs && typeof session.sessionTabs === 'object' ? session.sessionTabs : {})
    await Promise.all([chrome.storage.local.set({ [STORAGE_KEY]: { clientId, label } }), chrome.storage.session.set({ browserEpoch, sessionTabs: sessions.serialize() })])
  })()
  return initialized
}

function status(): NativeConnectionStatus & { label: string } {
  return { ...(transport?.connectionStatus() ?? { connected: false, status: 'connecting' as const }), label }
}
function broadcastStatus(): void { void chrome.runtime.sendMessage({ kind: 'status-update', ...status() }).catch(() => {}) }
function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect() }, reconnectDelay)
  reconnectDelay = Math.min(30_000, reconnectDelay * 2)
}
async function connect(): Promise<void> {
  await initialize()
  // A timed-out Chrome operation is abandoned only after its epoch closes.
  // Wait for the old debugger attachment to detach before accepting new work.
  await debuggerTeardown
  if (nativeConnected) return
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  const next = new NativeExtensionTransport({
    hello: { clientId, browserEpoch, extensionVersion: chrome.runtime.getManifest().version, label },
    execute: executeCommand,
    disconnectError: () => chrome.runtime.lastError?.message,
    onStatus: info => { if (info.connected) reconnectDelay = 1000; broadcastStatus() },
    onDisconnect: () => {
      nativeConnected = false; snapshots.clear()
      debuggerTeardown = debugSession.close().catch(() => {})
      scheduleReconnect()
    }
  })
  transport = next
  try {
    nativeConnected = true
    next.attach(chrome.runtime.connectNative(NATIVE_HOST_NAME))
  } catch (error) { nativeConnected = false; next.fail(String(error)) }
}
async function saveTabs(): Promise<void> { await chrome.storage.session.set({ sessionTabs: sessions.serialize() }) }

async function ownedTab(ownerId: string, params: Record<string, unknown>, context: NativeActionContext): Promise<number> {
  context.assertActive()
  const tabId = params.tabId === undefined ? sessions.tabFor(ownerId) : Number(params.tabId)
  if (tabId === undefined) throw new Error('TAB_UNASSIGNED: assign a tab to this chat in BS Coding Browser settings')
  sessions.assertOwned(ownerId, tabId)
  try { await chrome.tabs.get(tabId) } catch {
    sessions.closed(tabId); snapshots.invalidateTab(tabId); void saveTabs()
    throw new Error('TAB_CLOSED: the assigned tab is closed; assign a tab or navigate again')
  }
  context.assertActive()
  return tabId
}
async function cdp(tabId: number, method: string, params: object | undefined, context: NativeActionContext): Promise<unknown> {
  context.assertActive()
  const response = await chrome.debugger.sendCommand({ tabId }, method, params)
  context.assertActive()
  return response
}
async function ensureDebug(tabId: number, context: NativeActionContext): Promise<void> {
  context.assertActive()
  const previous = debugSession.attachedTabId()
  if (previous !== null && previous !== tabId) snapshots.invalidateTab(previous)
  await debugSession.ensure(tabId)
  context.assertActive()
}
async function groupTab(tabId: number, context: NativeActionContext): Promise<{ groupId?: number; groupTitle?: string }> {
  try {
    context.assertActive()
    const groups = await chrome.tabGroups.query({})
    context.assertActive()
    const groupId = await chrome.tabs.group({ tabIds: [tabId], ...(groups.find(group => group.title === 'Bs') ? { groupId: groups.find(group => group.title === 'Bs')!.id } : {}) })
    context.assertActive()
    await chrome.tabGroups.update(groupId, { title: 'Bs', color: 'blue' })
    return { groupId, groupTitle: 'Bs' }
  } catch (error) { context.assertActive(); return {} }
}
async function sendToTab(tabId: number, name: string, params: Record<string, unknown>, context: NativeActionContext): Promise<BrowserCommandResult> {
  context.assertActive()
  let available = true
  try { await chrome.tabs.sendMessage(tabId, { kind: 'probe' }) } catch { available = false }
  context.assertActive()
  if (!available) { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); context.assertActive() }
  // Only the readiness probe is retried. An action with an unknown result is never replayed.
  const result = await chrome.tabs.sendMessage(tabId, { kind: 'cmd', name, params, deadline: Date.now() + context.remainingMs() })
  context.assertActive()
  return result as BrowserCommandResult
}
async function waitForPageSettle(tabId: number, context: NativeActionContext): Promise<void> {
  const timeout = Math.max(0, Math.min(5000, context.remainingMs() - 100))
  await cdp(tabId, 'Runtime.evaluate', { expression: `new Promise(resolve => {const deadline=Date.now()+${timeout};let changed=Date.now();const observer=new MutationObserver(()=>changed=Date.now());observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true});const tick=()=>{if(Date.now()>=deadline||(document.readyState==='complete'&&Date.now()-changed>300)){observer.disconnect();resolve(true)}else setTimeout(tick,100)};tick()})`, awaitPromise: true, returnByValue: true }, context)
}
interface FrameTreeLike { frame: { id: string }; childFrames?: FrameTreeLike[] }
async function collectFrameAx(tabId: number, context: NativeActionContext): Promise<AxFrameBundle[]> {
  const result = await cdp(tabId, 'Page.getFrameTree', undefined, context) as { frameTree: FrameTreeLike }
  const bundles: AxFrameBundle[] = []
  const visit = async (node: FrameTreeLike, ownerBackendNodeId?: number): Promise<void> => {
    const frameId = node.frame.id
    const result = await cdp(tabId, 'Accessibility.getFullAXTree', { frameId }, context) as { nodes?: AxNodeLike[] }
    if (!Array.isArray(result.nodes)) throw new Error('SNAPSHOT_INCOMPLETE: an accessibility frame could not be read')
    bundles.push({ frameId, ownerBackendNodeId, nodes: result.nodes })
    for (const child of node.childFrames ?? []) {
      const owner = await cdp(tabId, 'DOM.getFrameOwner', { frameId: child.frame.id }, context) as { backendNodeId: number }
      await visit(child, owner.backendNodeId)
    }
  }
  await visit(result.frameTree)
  return bundles
}
async function refAction(ownerId: string, tabId: number, name: string, params: Record<string, unknown>, context: NativeActionContext): Promise<BrowserCommandResult> {
  const ref = String(params.ref)
  // Resolve before attaching: a detached generation must not become valid by reattaching.
  const backendNodeId = snapshots.resolve(ownerId, tabId, ref, typeof params.snapshotId === 'string' ? params.snapshotId : undefined)
  await ensureDebug(tabId, context)
  snapshots.resolve(ownerId, tabId, ref, typeof params.snapshotId === 'string' ? params.snapshotId : undefined)
  const resolved = await cdp(tabId, 'DOM.resolveNode', { backendNodeId }, context) as { object?: { objectId?: string } }
  if (!resolved.object?.objectId) throw new Error('STALE_SNAPSHOT: the referenced element no longer exists')
  snapshots.resolve(ownerId, tabId, ref)
  const functionDeclaration = name === 'click'
    ? `function(){if(!this.isConnected)throw Error('STALE_SNAPSHOT');this.scrollIntoView({block:'center',inline:'center'});this.click();return true}`
    : name === 'type'
      ? `function(text){if(!this.isConnected)throw Error('STALE_SNAPSHOT');this.focus();const proto=this instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:this instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(this,text);else this.textContent=text;this.dispatchEvent(new Event('input',{bubbles:true}));this.dispatchEvent(new Event('change',{bubbles:true}));return true}`
      : `function(value){if(!this.isConnected)throw Error('STALE_SNAPSHOT');this.value=value;this.dispatchEvent(new Event('change',{bubbles:true}));return true}`
  const result = await cdp(tabId, 'Runtime.callFunctionOn', { objectId: resolved.object.objectId, functionDeclaration, arguments: name === 'click' ? [] : [{ value: String(params.text ?? params.value ?? '') }], returnByValue: true }, context) as { exceptionDetails?: { text?: string; exception?: { description?: string } } }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Action failed')
  return { ok: true, data: { ref, tabId } }
}
async function executeCommand(command: NativeCommand, context: NativeActionContext): Promise<BrowserCommandResult> {
  const { ownerId, name } = command
  const params = command.params ?? {}
  context.assertActive()
  if (name === 'listTabs') {
    const tabs = await chrome.tabs.query({})
    context.assertActive()
    return { ok: true, data: tabs.map(tab => ({ id: tab.id, tabId: tab.id, title: tab.title, url: tab.url, active: tab.active, windowId: tab.windowId, groupId: tab.groupId, ownerId: tab.id === undefined ? undefined : sessions.ownerFor(tab.id) })) }
  }
  if (name === 'claimTab') {
    const tabId = Number(params.tabId)
    const tab = await chrome.tabs.get(tabId)
    context.assertActive()
    sessions.bind(ownerId, tabId)
    snapshots.invalidateOwner(ownerId)
    await saveTabs()
    return { ok: true, data: { tabId, id: tabId, url: tab.url } }
  }
  if (name === 'navigate' || name === 'openTab') {
    if (params.tabId !== undefined) {
      if (name === 'openTab') throw new Error('openTab creates a new session tab; omit tabId')
      const tabId = await ownedTab(ownerId, params, context)
      snapshots.invalidateTab(tabId)
      context.assertActive()
      const tab = await chrome.tabs.update(tabId, { url: String(params.url ?? '') })
      context.assertActive()
      return { ok: true, data: { tabId, id: tabId, url: tab?.url } }
    }
    context.assertActive()
    const tab = await chrome.tabs.create({ url: String(params.url ?? ''), active: false })
    // Record the lease even if the connection disappears after Chrome creates the tab.
    if (tab.id === undefined) throw new Error('TAB_CREATE_FAILED: Chrome did not return a tab id')
    sessions.bind(ownerId, tab.id)
    snapshots.invalidateOwner(ownerId)
    await saveTabs()
    context.assertActive()
    const group = await groupTab(tab.id, context)
    return { ok: true, data: { id: tab.id, tabId: tab.id, url: tab.url, ...group } }
  }
  if (name === 'getConsoleLogs') return { ok: true, data: logs.console(ownerId) }
  if (name === 'getNetworkLogs') return { ok: true, data: logs.network(ownerId) }
  const tabId = await ownedTab(ownerId, params, context)
  if (name === 'switchTab') {
    context.assertActive()
    const tab = await chrome.tabs.update(tabId, { active: true })
    context.assertActive()
    sessions.bind(ownerId, tabId)
    await saveTabs()
    return { ok: true, data: { id: tabId, tabId, url: tab?.url } }
  }
  if (name === 'closeTab') {
    snapshots.invalidateTab(tabId)
    context.assertActive()
    await chrome.tabs.remove(tabId)
    sessions.closed(tabId)
    await saveTabs()
    return { ok: true }
  }
  if (name === 'reload') {
    snapshots.invalidateTab(tabId)
    context.assertActive()
    await chrome.tabs.reload(tabId)
    return { ok: true }
  }
  if (name === 'screenshot') {
    await ensureDebug(tabId, context)
    const result = await cdp(tabId, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true }, context) as { data?: string }
    if (!result.data) throw new Error('SCREENSHOT_FAILED: Chrome produced no image')
    return { ok: true, data: { tabId, base64: result.data } }
  }
  if (name === 'read') {
    await ensureDebug(tabId, context)
    await waitForPageSettle(tabId, context)
    const generation = snapshots.generation(tabId)
    const frames = await collectFrameAx(tabId, context)
    const tab = await chrome.tabs.get(tabId)
    context.assertActive()
    if (snapshots.generation(tabId) !== generation) throw new Error('STALE_SNAPSHOT: the tab navigated while reading; read again')
    const { tree, refs } = axTreeToSnapshot(mergeFrameAxTrees(frames), { mode: params.mode === 'full' ? 'full' : 'interactive', maxNodes: 0 })
    const snapshot = snapshots.save(ownerId, tabId, tree, refs)
    return { ok: true, data: { ...snapshot, url: tab.url, title: tab.title } }
  }
  if ((name === 'click' || name === 'type' || name === 'select') && params.ref !== undefined) return refAction(ownerId, tabId, name, params, context)
  return sendToTab(tabId, name, params, context)
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.kind === 'status') { respond(status()); return false }
  if (message?.kind === 'connect') {
    void initialize().then(async () => {
      label = typeof message.label === 'string' && message.label.trim() ? message.label.trim().slice(0, 80) : label
      await chrome.storage.local.set({ [STORAGE_KEY]: { clientId, label } })
      transport?.close(); nativeConnected = false; snapshots.clear(); await debugSession.close()
      await connect(); respond({ ok: true, ...status() })
    }).catch(error => respond({ ok: false, error: String(error) }))
    return true
  }
  if (message?.kind === 'event' && sender.tab?.id !== undefined) {
    const ownerId = sessions.ownerFor(sender.tab.id)
    if (ownerId && (message.name === 'domChanged' || message.name === 'tabUpdated')) transport?.event(ownerId, message.name, message.data)
    respond({ ok: Boolean(ownerId) }); return false
  }
  return false
})
chrome.tabs.onRemoved.addListener(tabId => {
  snapshots.invalidateTab(tabId); logs.closed(tabId); sessions.closed(tabId); void saveTabs()
  if (debugSession.attachedTabId() === tabId) void debugSession.close()
})
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!sessions.ownerFor(tabId)) return
  if (change.status === 'loading' || change.url) snapshots.invalidateTab(tabId)
  const ownerId = sessions.ownerFor(tabId)!
  transport?.event(ownerId, 'tabUpdated', { tabId, status: change.status, url: change.url, ts: Date.now() })
})
chrome.debugger.onDetach.addListener(source => {
  if (source.tabId === undefined) return
  snapshots.invalidateTab(source.tabId); logs.closed(source.tabId)
  if (debugSession.attachedTabId() === source.tabId) void debugSession.close()
})
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId === undefined) return
  const ownerId = sessions.ownerFor(source.tabId)
  if (!ownerId || debugSession.attachedTabId() !== source.tabId) return
  if ((method === 'Page.frameNavigated' && !(params as { frame?: { parentId?: string } } | undefined)?.frame?.parentId) || method === 'Page.navigatedWithinDocument') snapshots.invalidateTab(source.tabId)
  const event = logs.record(ownerId, source.tabId, debugSession.attachedTabId(), method, params as Record<string, unknown> ?? {})
  if (event) transport?.event(ownerId, event.name, event.data)
})
chrome.runtime.onInstalled.addListener(() => { void connect() })
chrome.runtime.onStartup.addListener(() => { void connect() })
setInterval(() => transport?.heartbeat(), 20_000)
void chrome.alarms.create(ALARM_NAME, { periodInMinutes: 0.5 }).catch(() => {})
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME && !nativeConnected) void connect() })
void connect()
