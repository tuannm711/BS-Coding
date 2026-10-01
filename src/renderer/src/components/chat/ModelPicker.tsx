import { useCallback, useEffect, useState } from 'react'
import { shouldAcceptSnapshot, type ProviderSnapshot } from '@shared/provider-state'
import { modelsForAgentQuota } from '@shared/agent-quota-binding'
import { mergeAssignmentEvent } from '../RightPanelQuota'

interface Props {
  agentId: string
  disabled?: boolean
}

export function agentQuotaModelOptions(agentId: string, snapshot: ProviderSnapshot | null) {
  const assignment = snapshot?.assignments.find(item => item.agentId === agentId)
  if (!assignment) return []
  const account = snapshot?.accounts.find(item => item.providerId === assignment.providerId && item.id === assignment.accountId && item.status === 'active')
  if (!account) return []
  const allowed = new Set(modelsForAgentQuota({ provider: assignment.providerId, accountId: account.id, quotaPoolId: assignment.quotaPoolId, model: assignment.modelId }, [account]))
  return account.models.filter(model => allowed.has(model.id))
}

export default function ModelPicker({ agentId, disabled = false }: Props) {
  const [snapshot, setSnapshot] = useState<ProviderSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const next = await window.api.getProviderSnapshot()
    setSnapshot(current => !current || shouldAcceptSnapshot(current.revision, next.revision) ? next : current)
  }, [])

  useEffect(() => {
    void refresh().catch(err => setError(String(err)))
    const unsubscribeSnapshot = window.api.onProviderSnapshotChanged(next => setSnapshot(current => !current || shouldAcceptSnapshot(current.revision, next.revision) ? next : current))
    const unsubscribeAssignment = window.api.onAgentAssignmentChanged(event => setSnapshot(previous => previous ? mergeAssignmentEvent(previous, event) : previous))
    return () => { unsubscribeSnapshot(); unsubscribeAssignment() }
  }, [refresh])
  useEffect(() => setError(''), [agentId])

  const assignment = snapshot?.assignments.find(item => item.agentId === agentId)
  const models = agentQuotaModelOptions(agentId, snapshot)
  const reason = disabled ? 'Model locked while running' : models.length === 0 ? 'Assign an available account quota in Settings → Agents' : 'Switch model within this agent quota'

  return <div className="model-picker">
    <select className="model-trigger" aria-label="Agent model" title={reason}
      disabled={disabled || busy || models.length === 0 || assignment?.status !== 'ready'} value={assignment?.modelId ?? ''}
      onChange={event => {
        const model = event.target.value
        if (!assignment || busy) return
        setBusy(true)
        setError('')
        void window.api.setAgentModel(agentId, assignment.providerId, model)
          .then(async () => {
            await refresh()
            window.dispatchEvent(new CustomEvent('bs:model-changed', { detail: { agentId } }))
          })
          .catch(err => setError(String(err)))
          .finally(() => setBusy(false))
      }}>
      {!models.some(model => model.id === assignment?.modelId) && <option value={assignment?.modelId ?? ''}>{assignment?.modelId || 'Select quota in Settings'}</option>}
      {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
    </select>
    {error && <span className="model-picker-error" role="alert">{error}</span>}
  </div>
}
