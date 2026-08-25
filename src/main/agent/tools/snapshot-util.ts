import { existsSync, readFileSync } from 'node:fs'
import type { ToolContext } from './types'

export function snapshotFile(ctx: ToolContext, filePath: string): void {
  const scopeId = ctx.snapshotScopeId ?? ctx.agentId
  if (!ctx.snapshots || !scopeId) return
  if (!existsSync(filePath)) return
  try {
    ctx.snapshots.snapshot(scopeId, filePath, readFileSync(filePath, 'utf-8'), ctx.toolCallId)
  } catch {
    /* ignore snapshot errors */
  }
}
