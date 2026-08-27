import { FileText, FolderTree, Users } from 'lucide-react'
import type { AgentConfig, AgentRole, ArtifactEntry } from '@shared/types'
import RightPanelTree from './RightPanelTree'
import RightPanelArtifacts from './RightPanelArtifacts'
import FleetPanel from './fleet/FleetPanel'

export type RightPanelTab = 'tree' | 'artifacts' | 'fleet'

interface Props {
  root: string | null
  tab: RightPanelTab
  artifacts: ArtifactEntry[]
  agents: AgentConfig[]
  onSelectAgent: (agentId: string) => void
  onSetRole: (agentId: string, role: AgentRole) => void
  onTabChange: (tab: RightPanelTab) => void
  onClearArtifacts: () => void
}

function FolderTreeIcon() {
  return <FolderTree size={14} aria-hidden="true" />
}

function ArtifactIcon() {
  return <FileText size={14} aria-hidden="true" />
}

export default function RightPanel({
  root, tab, artifacts, agents, onSelectAgent, onSetRole, onTabChange, onClearArtifacts
}: Props) {

  return (
    <div className="right-panel">
      <div className="right-panel-main">
        <div className="right-panel-content">
        {/* Keep both views mounted so the tree keeps its expanded state (and
            scroll position) when the user switches tabs. */}
        <div className={`right-panel-view${tab === 'tree' ? '' : ' hidden'}`}>
          <RightPanelTree root={root} />
        </div>
        <div className={`right-panel-view${tab === 'artifacts' ? '' : ' hidden'}`}>
          <RightPanelArtifacts root={root} artifacts={artifacts} onClear={onClearArtifacts} />
        </div>
        <div className={`right-panel-view${tab === 'fleet' ? '' : ' hidden'}`}>
          <FleetPanel agents={agents} onSelectAgent={onSelectAgent} onSetRole={onSetRole} />
        </div>
        </div>
        <div className="right-panel-tabs" role="tablist" aria-label="Right panel tabs">
        <button
          className={`right-panel-tab${tab === 'tree' ? ' active' : ''}`}
          title="Directory Tree"
          aria-label="Directory Tree"
          onClick={() => onTabChange('tree')}
        >
          <FolderTreeIcon />
        </button>
        <button
          className={`right-panel-tab${tab === 'artifacts' ? ' active' : ''}`}
          title="Artifacts"
          aria-label="Artifacts"
          onClick={() => onTabChange('artifacts')}
        >
          <ArtifactIcon />
        </button>
        <button
          className={`right-panel-tab${tab === 'fleet' ? ' active' : ''}`}
          title="Fleet"
          aria-label="Fleet"
          onClick={() => onTabChange('fleet')}
        >
          <Users size={14} aria-hidden="true" />
        </button>
        </div>
      </div>
    </div>
  )
}
