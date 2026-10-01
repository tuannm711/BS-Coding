import { useCallback, useEffect, useId, useState } from 'react'
import type { McpServerStatus, BsSettings, Template } from '@shared/types'
import ProvidersTab from './ProvidersTab'
import AgentsTab from './AgentsTab'
import PermissionsTab from './PermissionsTab'
import McpTab from './McpTab'
import ContextTab from './ContextTab'
import CommandsTab from './CommandsTab'
import TemplatesTab from './TemplatesTab'
import UpdatesTab from './UpdatesTab'
import StatsTab from './StatsTab'
import QuickMessagesTab from './QuickMessagesTab'
import Modal from './Modal'
import { useDialogFocus } from './useDialogFocus'
import AppearanceTab from './AppearanceTab'
import { isHexColor } from '@shared/appearance'

type TabId = 'appearance' | 'providers' | 'agents' | 'quick-messages' | 'permissions' | 'mcp' | 'context' | 'commands' | 'templates' | 'updates' | 'stats'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'providers', label: 'Providers' },
  { id: 'agents', label: 'Agents' },
  { id: 'quick-messages', label: 'Quick Messages' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'mcp', label: 'MCP' },
  { id: 'context', label: 'Context' },
  { id: 'commands', label: 'Commands' },
  { id: 'updates', label: 'Updates' },
  { id: 'stats', label: 'Usage' }
]

interface Props {
  onClose: () => void
  projectPath?: string
  templates: Template[]
  onTemplatesChange: (templates: Template[]) => void
  runtimeAgents: Array<{ id: string; name: string }>
}

export default function SettingsDialog({ onClose, projectPath, templates, onTemplatesChange, runtimeAgents }: Props) {
  const [tab, setTab] = useState<TabId>('providers')
  const [draft, setDraft] = useState<BsSettings | null>(null)
  const [saved, setSaved] = useState<BsSettings | null>(null)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus[]>([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const titleId = useId()

  const refresh = useCallback(async () => {
    try {
      const [settings, mcps] = await Promise.all([
        window.api.getSettings(),
        window.api.getMcpStatus()
      ])
      setDraft(settings)
      setSaved(settings)
      setMcpStatus(mcps)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isDirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved)
  const invalidAppearance = draft?.appearance && !Object.values(draft.appearance).every(isHexColor)

  // Closing with unsaved changes (Escape, Cancel) would otherwise discard
  // them silently — nothing auto-saves until the Save button is clicked.
  const closeGuarded = useCallback(() => {
    if (saving) return
    if (isDirty) { setDiscarding(true); return }
    onClose()
  }, [isDirty, onClose, saving])

  // Close on Escape only — the backdrop no longer closes on outside click.
  const focus = useDialogFocus(closeGuarded)

  const patch = useCallback((patch: Partial<BsSettings>) => {
    setDraft(prev => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const save = async () => {
    if (!draft || saving || invalidAppearance) return
    setSaving(true)
    setStatus('')
    setError('')
    try {
      const result = await window.api.saveSettings(draft)
      setDraft(result)
      setSaved(result)
      window.dispatchEvent(new CustomEvent('bs:settings-saved', { detail: result }))
      setStatus('Settings saved.')
      void window.api.getMcpStatus().then(setMcpStatus).catch(() => {})
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} {...focus}>
        <h3 id={titleId}>Settings</h3>
        <p className="settings-subtitle">Configure your workspace and agents.</p>
        <button className="dialog-close" aria-label="Close" onClick={closeGuarded}>✕</button>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`settings-nav-item ${tab === t.id ? 'active' : ''}`}
                aria-current={tab === t.id ? 'page' : undefined}
                disabled={saving}
                onClick={() => { setTab(t.id); setStatus('') }}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <fieldset className="settings-content" disabled={saving} aria-busy={saving}>
            <h4 className="settings-section-title">{TABS.find(t => t.id === tab)?.label}</h4>
            {!draft && !error && <p role="status" className="settings-hint">Loading settings…</p>}
            {!draft && error && <button className="btn" onClick={() => { setError(''); void refresh() }}>Retry loading settings</button>}
            {draft && tab === 'appearance' && <AppearanceTab appearance={draft.appearance} onChange={appearance => patch({ appearance })} />}
            {draft && tab === 'providers' && (
              <ProvidersTab />
            )}
            {draft && tab === 'agents' && (
              <AgentsTab
                agents={draft.agents}
                runtimeAgents={runtimeAgents}
                onChangeAgents={agents => patch({ agents })}
              />
            )}
            {draft && tab === 'quick-messages' && <QuickMessagesTab messages={draft.quickMessages ?? []} onChange={quickMessages => patch({ quickMessages })} />}
            {draft && tab === 'permissions' && (
              <PermissionsTab permission={draft.permission} onChange={permission => patch({ permission })} />
            )}
            {draft && tab === 'mcp' && (
              <McpTab
                mcp={draft.mcp}
                status={mcpStatus}
                onChange={mcp => patch({ mcp })}
              />
            )}
            {draft && tab === 'context' && (
              <ContextTab
                maxContextTokens={draft.maxContextTokens}
                maxSteps={draft.maxSteps}
                compaction={draft.compaction}
                toolOutput={draft.toolOutput}
                notifications={draft.notifications ?? { needsInput: true, onDone: true }}
                onChange={ctx => patch(ctx)}
              />
            )}
            {tab === 'commands' && <CommandsTab projectPath={projectPath} />}
            {tab === 'templates' && <TemplatesTab templates={templates} onChange={onTemplatesChange} />}
            {tab === 'updates' && <UpdatesTab />}
            {tab === 'stats' && <StatsTab />}
          </fieldset>
        </div>
        <div className="settings-feedback">
          {status && <div className="settings-status" role="status">{status}</div>}
          {error && <div className="settings-error" role="alert">{error}</div>}
          {!status && !error && <span className="settings-hint">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>}
        </div>
        <div className="dialog-actions settings-footer">
          <button className="btn" disabled={saving} onClick={closeGuarded}>Cancel</button>
          <button className="btn primary" disabled={!draft || saving || !!invalidAppearance} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {discarding && <Modal title="Discard unsaved settings?" onClose={() => setDiscarding(false)} showDefaultActions={false}>
          <p>Your unsaved changes will be lost.</p>
          <div className="dialog-actions"><button type="button" className="btn" onClick={() => setDiscarding(false)}>Keep editing</button><button type="button" className="btn danger" onClick={onClose}>Discard changes</button></div>
        </Modal>}
      </div>
    </div>
  )
}
