import type { BrowserCommandName, BrowserCommandResult, BrowserEventName } from './browser-types'

export const NATIVE_HOST_NAME = 'com.bscoding.browser'
export const NATIVE_PROTOCOL_VERSION = 1
export const NATIVE_CAPABILITIES = ['session-tabs', 'snapshot-generation', 'cdp-events'] as const

export interface NativeHello {
  type: 'hello'
  protocolVersion: number
  clientId: string
  browserEpoch: string
  extensionVersion: string
  label: string
  capabilities: string[]
}
export interface NativeCommand {
  type: 'cmd'
  id: string
  epoch: string
  ownerId: string
  deadline: number
  name: BrowserCommandName | 'claimTab'
  params?: Record<string, unknown>
}
export type NativeResult = BrowserCommandResult & { type: 'result'; id: string; epoch: string; ownerId: string }
export type NativeExtensionMessage = NativeHello | NativeResult | { type: 'event'; epoch: string; ownerId: string; name: BrowserEventName; data: unknown } | { type: 'ping' }
export type NativeAppMessage = NativeCommand | { type: 'cancel'; id: string; epoch: string } | { type: 'hello_result'; ok: boolean; epoch?: string; protocolVersion: number; error?: string } | { type: 'pong' } | { type: 'host_status'; error: string; code: string }

export const BROWSER_COMMANDS = ['navigate', 'openTab', 'switchTab', 'closeTab', 'reload', 'listTabs', 'click', 'type', 'select', 'scroll', 'read', 'screenshot', 'waitFor', 'watchStart', 'watchStop', 'getConsoleLogs', 'getNetworkLogs', 'claimTab'] as const

// Derived from the committed public Chrome manifest key.
export const NATIVE_EXTENSION_ID = 'ebleahkdkcndndlmlaealbgohjchgdam'
