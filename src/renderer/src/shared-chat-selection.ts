import type { AgentConfig } from '@shared/types'
import type { PaneModel } from './App'

export function resolveSelectedNativeAgent(agents: AgentConfig[], selectedId: string | null): string | null {
  const native = agents.filter(agent => agent.kind === 'native')
  if (selectedId && native.some(agent => agent.id === selectedId)) return selectedId
  return native.find(agent => agent.name === 'bs')?.id ?? native[0]?.id ?? null
}

export function projectVisiblePanes(panes: PaneModel[], selectedNativeId: string | null): PaneModel[] {
  const selected = panes.find(pane => pane.agent.kind === 'native' && pane.agent.id === selectedNativeId)
  const nonNative = panes.filter(pane => pane.agent.kind !== 'native')
  return selected ? [selected, ...nonNative] : nonNative
}
