import { useState } from 'react'
import type { AgentSettings } from '@shared/types'
import Modal from './Modal'

interface Props {
  agent: AgentSettings
  onClose(): void
  onSave(systemPrompt: string): void
}

export default function AgentPromptModal({ agent, onClose, onSave }: Props) {
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt)

  return (
    <Modal
      title={`Edit ${agent.name} system prompt`}
      onClose={onClose}
      onSubmit={() => onSave(systemPrompt)}
      submitLabel="Save prompt"
    >
      <div className="settings-field">
        <label className="label" htmlFor={`agent-prompt-${agent.name}`}>System prompt</label>
        <textarea
          id={`agent-prompt-${agent.name}`}
          className="input agents-prompt"
          value={systemPrompt}
          onChange={event => setSystemPrompt(event.target.value)}
          autoFocus
        />
        <p className="settings-hint">Applied the next time this Agent starts a turn.</p>
      </div>
    </Modal>
  )
}
