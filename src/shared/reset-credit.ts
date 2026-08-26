import type { ProviderUsage } from './types'

export type ResetCreditGate = { allowed: true } | { allowed: false; reason: string }

/** Strictly under this, never equal to it. */
export const WEEKLY_REMAINING_LIMIT = 5

// A reset credit resets the whole weekly quota, not the 5-hour window alone, so
// spending one while the week is largely unused throws away its value. Both
// processes evaluate this: the button is a courtesy, the manager is the
// authority, and the action cannot be undone.
export function resetCreditGate(usage: ProviderUsage | undefined): ResetCreditGate {
  const available = usage?.resetCredits?.available ?? 0
  if (available <= 0) return { allowed: false, reason: 'No reset credit available' }
  const week = usage?.quotaGroups?.flatMap(group => group.windows).find(window => window.kind === 'weekly')
  if (!week || !week.usageKnown || week.remainingPercent === undefined) {
    return { allowed: false, reason: 'Weekly quota is not reported, so this cannot be checked' }
  }
  if (week.remainingPercent >= WEEKLY_REMAINING_LIMIT) {
    return {
      allowed: false,
      reason: `Weekly quota is at ${Math.round(week.remainingPercent)}% — a reset is only worth spending below ${WEEKLY_REMAINING_LIMIT}%`
    }
  }
  return { allowed: true }
}
