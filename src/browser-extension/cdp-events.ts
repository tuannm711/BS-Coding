import type { BrowserEvent } from '../shared/browser-types'

interface ConsoleEntry { level: string; text: string; ts: number }
interface NetworkEntry { method: string; url: string; status: number; ms: number; ts: number; error?: string }

export class SessionCdpEvents {
  private consoleLogs = new Map<string, ConsoleEntry[]>()
  private networkLogs = new Map<string, NetworkEntry[]>()
  private requests = new Map<string, { ownerId: string; tabId: number; method: string; url: string; start: number }>()
  console(ownerId: string): ConsoleEntry[] { return [...(this.consoleLogs.get(ownerId) ?? [])] }
  network(ownerId: string): NetworkEntry[] { return [...(this.networkLogs.get(ownerId) ?? [])] }
  closed(tabId: number): void { for (const [id, request] of this.requests) if (request.tabId === tabId) this.requests.delete(id) }
  private append<T>(map: Map<string, T[]>, owner: string, entry: T): void {
    const entries = map.get(owner) ?? []
    entries.push(entry)
    if (entries.length > 200) entries.shift()
    map.set(owner, entries)
  }
  record(ownerId: string | undefined, tabId: number, attachedTabId: number | null, method: string, params: Record<string, unknown>): BrowserEvent | null {
    if (!ownerId || tabId !== attachedTabId) return null
    if (method === 'Runtime.consoleAPICalled' || method === 'Runtime.exceptionThrown') {
      const args = Array.isArray(params.args) ? params.args as Array<{ value?: unknown; description?: string; type?: string }> : []
      const details = params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined
      const text = method === 'Runtime.exceptionThrown' ? details?.exception?.description ?? details?.text ?? 'JavaScript exception'
        : args.map(arg => String(arg.value ?? arg.description ?? arg.type ?? '')).join(' ')
      const data = { level: method === 'Runtime.exceptionThrown' ? 'error' : String(params.type ?? 'log'), text: text.slice(0, 4000), ts: Date.now() }
      this.append(this.consoleLogs, ownerId, data)
      return { name: 'console', data }
    }
    const key = `${tabId}/${String(params.requestId ?? '')}`
    if (method === 'Network.requestWillBeSent') {
      const request = params.request as { method?: string; url?: string } | undefined
      if (this.requests.size >= 400) this.requests.delete(this.requests.keys().next().value!)
      this.requests.set(key, { ownerId, tabId, method: String(request?.method ?? 'GET'), url: String(request?.url ?? '').slice(0, 4000), start: Number(params.timestamp ?? 0) })
      return null
    }
    if (method !== 'Network.responseReceived' && method !== 'Network.loadingFailed') return null
    const request = this.requests.get(key)
    this.requests.delete(key)
    if (!request || request.ownerId !== ownerId) return null
    const response = params.response as { status?: number } | undefined
    const data: NetworkEntry = {
      method: request.method, url: request.url, status: Number(response?.status ?? 0),
      ms: Math.max(0, Math.round((Number(params.timestamp ?? request.start) - request.start) * 1000)), ts: Date.now(),
      ...(method === 'Network.loadingFailed' ? { error: String(params.errorText ?? 'Request failed').slice(0, 1000) } : {})
    }
    this.append(this.networkLogs, ownerId, data)
    return { name: 'network', data }
  }
}
