import { useEffect, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { PaneModel } from '../App'
import Pane from './Pane'
import { resolveActiveAgentId } from '@shared/agent-selection'
import type { AgentConfig } from '@shared/types'
import { nativeChatPaneKey } from '../shared-chat-selection'

interface Props {
  panes: PaneModel[]
  nativeAgents: AgentConfig[]
  onSelectNativeAgent: (agentId: string) => void
  projectPath: string | null
  sessionId: string | null
  onSessionChange: (sessionId: string, agentId?: string) => void
  backgrounds: Record<string, boolean>
  isTerminal: (id: string) => boolean
  onRemove: (agentId: string) => void
  onRegisterTerminal: (agentId: string, term: Terminal) => void
  onUnregisterTerminal: (agentId: string) => void
}

export default function PaneGrid({ panes, nativeAgents, onSelectNativeAgent, projectPath, sessionId, onSessionChange, backgrounds, isTerminal, onRemove, onRegisterTerminal, onUnregisterTerminal }: Props) {
  const [zoomedId, setZoomedId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zoomedId) setZoomedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomedId])

  const columns = panes.length > 1 ? 2 : 1
  const validZoomedId = zoomedId && panes.some(pane => pane.agent.id === zoomedId) ? zoomedId : null
  const activeId = resolveActiveAgentId(
    panes.map(pane => ({ id: pane.agent.id, name: pane.agent.name })),
    validZoomedId ?? focusedId
  )

  return (
    <div
      className={`pane-grid ${validZoomedId ? 'zoom-mode' : ''}`}
      style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
    >
      {panes.map(pane => {
        const native = pane.agent.kind === 'native'
        const key = native && projectPath && sessionId ? nativeChatPaneKey(projectPath, sessionId) : pane.agent.id
        return (
        <Pane
          key={key}
          pane={pane}
          nativeAgents={nativeAgents}
          onSelectNativeAgent={onSelectNativeAgent}
          projectPath={projectPath}
          sessionId={sessionId}
          onSessionChange={onSessionChange}
          background={Boolean(backgrounds[pane.agent.id])}
          isTerminal={isTerminal(pane.agent.id)}
          zoomed={pane.agent.id === validZoomedId}
          active={pane.agent.id === activeId}
          onFocus={() => setFocusedId(pane.agent.id)}
          onZoom={() => setZoomedId(validZoomedId ? null : pane.agent.id)}
          onRemove={() => onRemove(pane.agent.id)}
          onRegisterTerminal={onRegisterTerminal}
          onUnregisterTerminal={onUnregisterTerminal}
        />
        )
      })}
    </div>
  )
}
