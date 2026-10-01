import type { BrowserCommandName } from '../../src/shared/browser-types'

type CmdResult = { ok: boolean; data?: unknown; error?: string }

interface CmdRequest {
  kind: 'cmd' | 'probe'
  name: BrowserCommandName
  params: Record<string, unknown>
  deadline?: number
}

function query(selector: string): Element | null {
  return document.querySelector(selector)
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function waitForEl(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise(resolve => {
    const el = query(selector)
    if (el) { resolve(el); return }
    const start = Date.now()
    const iv = setInterval(() => {
      const found = query(selector)
      if (found || Date.now() - start >= timeoutMs) {
        clearInterval(iv)
        resolve(found)
      }
    }, 200)
  })
}

function scrollIntoView(el: Element): void {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
}

async function execute(name: BrowserCommandName, params: Record<string, unknown>): Promise<CmdResult> {
  switch (name) {
    case 'navigate': {
      location.href = String(params.url)
      return { ok: true }
    }
    case 'click': {
      if (params.selector != null) {
        const el = query(String(params.selector))
        if (!el) return { ok: false, error: `selector not found: ${params.selector}` }
        scrollIntoView(el)
        ;(el as HTMLElement).click()
        return { ok: true, data: { selector: params.selector } }
      }
      if (params.x != null && params.y != null) {
        const el = document.elementFromPoint(Number(params.x), Number(params.y))
        if (!el) return { ok: false, error: `no element at (${params.x}, ${params.y})` }
        ;(el as HTMLElement).click()
        return { ok: true, data: { x: params.x, y: params.y } }
      }
      return { ok: false, error: 'click requires selector or x/y' }
    }
    case 'type': {
      if (params.selector == null) return { ok: false, error: 'type requires selector' }
      const el = query(String(params.selector))
      if (!el) return { ok: false, error: `selector not found: ${params.selector}` }
      const text = String(params.text ?? '')
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.focus()
        setNativeValue(el, text)
      } else {
        ;(el as HTMLElement).focus()
        el.textContent = text
      }
      return { ok: true }
    }
    case 'select': {
      if (params.selector == null) return { ok: false, error: 'select requires selector' }
      const el = query(String(params.selector))
      if (!el) return { ok: false, error: `selector not found: ${params.selector}` }
      const select = el as HTMLSelectElement
      select.value = String(params.value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
      return { ok: true }
    }
    case 'scroll': {
      if (params.selector != null) {
        const el = query(String(params.selector))
        if (!el) return { ok: false, error: `selector not found: ${params.selector}` }
        scrollIntoView(el)
        return { ok: true }
      }
      const dir = String(params.direction ?? 'down')
      if (dir === 'top') window.scrollTo(0, 0)
      else if (dir === 'bottom') window.scrollTo(0, document.body.scrollHeight)
      else if (dir === 'up') window.scrollBy(0, -window.innerHeight * 0.8)
      else window.scrollBy(0, window.innerHeight * 0.8)
      return { ok: true }
    }
    case 'waitFor': {
      const el = await waitForEl(String(params.selector), Number(params.timeoutMs ?? 10000))
      if (!el) return { ok: false, error: `timeout waiting for selector: ${params.selector}` }
      return { ok: true, data: { selector: params.selector } }
    }
    case 'watchStart': {
      startObserver()
      return { ok: true }
    }
    case 'watchStop': {
      stopObserver()
      return { ok: true }
    }
    default:
      return { ok: false, error: `unsupported command: ${name}` }
  }
}

function sendEvent(name: string, data: unknown): void {
  void chrome.runtime.sendMessage({ kind: 'event', name, data }).catch(() => {})
}

// ---- MutationObserver (watch) ----
let observer: MutationObserver | null = null
let watchTimer: ReturnType<typeof setTimeout> | null = null

function startObserver(): void {
  if (observer) return
  observer = new MutationObserver(() => {
    if (watchTimer) return
    watchTimer = setTimeout(() => {
      watchTimer = null
      sendEvent('domChanged', { url: location.href, ts: Date.now() })
    }, 300)
  })
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
}

function stopObserver(): void {
  observer?.disconnect()
  observer = null
  if (watchTimer) {
    clearTimeout(watchTimer)
    watchTimer = null
  }
}

window.addEventListener('load', () => {
  sendEvent('tabUpdated', { status: 'complete', url: location.href, ts: Date.now() })
})

chrome.runtime.onMessage.addListener((msg: CmdRequest, _sender, sendResponse) => {
  if (msg?.kind === 'probe') { sendResponse({ ok: true }); return false }
  if (msg?.kind !== 'cmd') return false
  if (!Number.isFinite(msg.deadline) || Date.now() >= msg.deadline!) { sendResponse({ ok: false, error: 'COMMAND_EXPIRED: browser command deadline passed' }); return false }
  void execute(msg.name, msg.params ?? {}).then(sendResponse)
  return true
})
