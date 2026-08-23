import type { ProviderUsage } from '@shared/types'

export function remainingPercent(used?: number): number | undefined {
  if (used === undefined || !Number.isFinite(used)) return undefined
  return Math.max(0, Math.min(100, Math.round(100 - used)))
}

export function formatPercent(value?: number): string {
  return value === undefined ? '—' : `${value}%`
}

export function formatCount(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString()
}

export function formatMoney(value?: number): string {
  return value === undefined ? '—' : `$${value.toFixed(4)}`
}

export function formatCountdown(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return '—'
  const seconds = Math.max(0, Math.round((timestamp - now) / 1000))
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatExpiry(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined) return '—'
  const days = Math.max(0, Math.ceil((timestamp - now) / 86400000))
  return days === 0 ? 'expires today' : `expires in ${days}d`
}

export function formatAge(timestamp: number | undefined, now = Date.now()): string {
  if (timestamp === undefined || timestamp <= 0) return '—'
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function usageRemaining(usage?: ProviderUsage): { primary?: number; secondary?: number } {
  return {
    primary: remainingPercent(usage?.primaryUsedPercent),
    secondary: remainingPercent(usage?.secondaryUsedPercent)
  }
}

export function formatProviderAccountType(providerId: string | undefined, authMode: string | undefined): string {
  const name = providerId === 'antigravity' ? 'Antigravity' : providerId === 'openai' ? 'ChatGPT' : providerId ? providerId : 'Provider'
  return authMode === 'oauth' ? `${name} OAuth` : authMode === 'api-key' ? `${name} API key` : `${name} ${authMode ?? 'Account'}`
}
