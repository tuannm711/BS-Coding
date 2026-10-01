import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import type { WorkspaceSummary } from '@shared/types'
import Modal from './settings/Modal'

interface Props {
  onAdd: (projectPath: string, name: string) => Promise<void>
  onClose: () => void
  project?: WorkspaceSummary
}

export default function AddProjectDialog({ onAdd, onClose, project }: Props) {
  const [path, setPath] = useState(project?.projectPath ?? '')
  const [name, setName] = useState(project?.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [discarding, setDiscarding] = useState(false)
  const id = useId()
  const dirty = path !== (project?.projectPath ?? '') || name !== (project?.name ?? '')
  const close = () => {
    if (saving) return
    if (dirty) setDiscarding(true)
    else onClose()
  }

  const pick = async () => {
    try {
      const folder = await window.api.pickFolder()
      if (folder) {
        setPath(folder)
        if (!name) setName(folder.split(/[\\/]/).pop() ?? folder)
      }
    } catch (err) { setError(String(err)) }
  }

  const save = async () => {
    if (saving) return
    if (!path.trim() || !name.trim()) { setError('Enter a project name and folder.'); return }
    setSaving(true)
    setError('')
    try { await onAdd(path.trim(), name.trim()) } catch (err) { setError(String(err)) }
    finally { setSaving(false) }
  }

  return createPortal(
    <Modal title={project ? 'Edit project' : 'Add project'} onClose={close} showDefaultActions={false}>
      <form className="project-form" noValidate onSubmit={event => { event.preventDefault(); void save() }} aria-busy={saving}>
        <label className="label" htmlFor={`${id}-name`}>Name</label>
        <input id={`${id}-name`} className="input" value={name} disabled={saving} onChange={e => setName(e.target.value)} autoFocus />
        <label className="label" htmlFor={`${id}-folder`}>Folder</label>
        <div className="row">
          <input id={`${id}-folder`} className="input grow" value={path} disabled={saving} onChange={e => setPath(e.target.value)} aria-describedby={project ? `${id}-hint` : undefined} />
          <button type="button" className="btn" disabled={saving} onClick={() => void pick()}>Browse</button>
        </div>
        {project && <p id={`${id}-hint`} className="settings-hint">Changing the folder keeps agents and chat history. Stop all project sessions and close its terminals first. This updates the project location; files are not moved.</p>}
        {error && <p className="settings-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={saving} onClick={close}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving || !path.trim() || !name.trim()}>
            {saving ? 'Saving…' : project ? 'Save changes' : 'Add'}
          </button>
        </div>
      </form>
      {discarding && <Modal title="Discard project changes?" onClose={() => setDiscarding(false)} showDefaultActions={false}>
        <p>Your unsaved changes will be lost.</p>
        <div className="dialog-actions"><button className="btn" onClick={() => setDiscarding(false)}>Keep editing</button><button className="btn danger" onClick={onClose}>Discard changes</button></div>
      </Modal>}
    </Modal>,
    document.body
  )
}
