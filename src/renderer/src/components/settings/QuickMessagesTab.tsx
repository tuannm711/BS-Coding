import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import type { QuickMessage } from '@shared/types'
import Modal from './Modal'

interface Props {
  messages: QuickMessage[]
  onChange: (messages: QuickMessage[]) => void
}

export default function QuickMessagesTab({ messages, onChange }: Props) {
  const [editing, setEditing] = useState<QuickMessage | null>(null)
  const [deleting, setDeleting] = useState<QuickMessage | null>(null)
  const save = () => {
    if (!editing?.name.trim() || !editing.message.trim()) return
    const next = { ...editing, name: editing.name.trim() }
    onChange(messages.some(message => message.id === next.id)
      ? messages.map(message => message.id === next.id ? next : message)
      : [...messages, next])
    setEditing(null)
  }

  return <div className="settings-tab">
    <div className="agents-head">
      <p className="settings-hint">Send a saved message to the selected agent with one click. Buttons appear between Mode and the agent picker.</p>
      <button type="button" className="btn primary small" onClick={() => setEditing({ id: crypto.randomUUID(), name: '', message: '' })}>+ Add button</button>
    </div>
    {!messages.length && <p className="settings-hint">No quick messages yet. Add a button to get started.</p>}
    <div className="quick-message-settings-list">
      {messages.map(message => <div className="quick-message-setting" key={message.id}>
        <div><strong>{message.name}</strong><p>{message.message}</p></div>
        <div className="agent-table-actions">
          <button type="button" className="agent-icon-button" aria-label={`Edit ${message.name}`} title="Edit button" onClick={() => setEditing(message)}><Pencil size={14} aria-hidden="true" /></button>
          <button type="button" className="agent-icon-button danger" aria-label={`Delete ${message.name}`} title="Delete button" onClick={() => setDeleting(message)}><Trash2 size={14} aria-hidden="true" /></button>
        </div>
      </div>)}
    </div>
    {editing && <Modal title={messages.some(message => message.id === editing.id) ? 'Edit quick message' : 'Add quick message'}
      onClose={() => setEditing(null)} onSubmit={save} submitLabel="Save button" submitDisabled={!editing.name.trim() || !editing.message.trim()}>
      <label className="label" htmlFor="quick-message-name">Name</label>
      <input id="quick-message-name" className="input" autoFocus value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} />
      <label className="label" htmlFor="quick-message-content">Message</label>
      <textarea id="quick-message-content" className="input quick-message-content resize-none" value={editing.message} onChange={event => setEditing({ ...editing, message: event.target.value })} />
      <p className="settings-hint">Both fields are required. Clicking this button sends the message immediately; a running agent queues it.</p>
    </Modal>}
    {deleting && <Modal title={`Delete ${deleting.name}?`} onClose={() => setDeleting(null)} showDefaultActions={false}>
      <p>The button will be removed when you save settings.</p>
      <div className="dialog-actions"><button type="button" className="btn" onClick={() => setDeleting(null)}>Cancel</button>
        <button type="button" className="btn danger" onClick={() => { onChange(messages.filter(message => message.id !== deleting.id)); setDeleting(null) }}>Delete button</button></div>
    </Modal>}
  </div>
}
