import type { AgentConfig } from '../../shared/types'

export interface NativeAgentReconciliation {
  add: string[]
  remove: string[]
}

export function planNativeAgentReconciliation(
  current: readonly AgentConfig[],
  desiredNames: readonly string[]
): NativeAgentReconciliation {
  const normalized = desiredNames.map(name => name.trim()).filter(Boolean)
  const duplicate = normalized.find((name, index) => normalized.indexOf(name) !== index)
  if (duplicate) throw new Error(`[bs] Duplicate Agent profile name: ${duplicate}`)
  const desired = new Set(['bs', ...normalized])
  const nativeAgents = current.filter(agent => agent.kind === 'native')
  const currentNames = new Set<string>()
  const remove: string[] = []
  for (const agent of nativeAgents) {
    if (!desired.has(agent.name) || currentNames.has(agent.name)) {
      if (agent.name !== 'bs' || currentNames.has('bs')) remove.push(agent.id)
      continue
    }
    currentNames.add(agent.name)
  }
  return {
    add: [...desired].filter(name => !currentNames.has(name)),
    remove
  }
}
