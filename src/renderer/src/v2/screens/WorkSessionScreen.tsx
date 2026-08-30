import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Clock3, History, Pause, Play, RotateCcw, Square } from 'lucide-react'
import type { WorkflowRun, WorkSession, WorkSessionStatus } from '../../../../shared/v2/contracts/domain'
import type { RuntimeTargetCandidateSummary } from '../../../../shared/v2/contracts/provider'
import type { ProjectSummary, WorkProjection } from '../../../../shared/v2/contracts/ui-projections'
import type { BudgetPolicy, UsageOverview } from '../../../../shared/v2/contracts/usage'
import ConversationView from './work/ConversationView'
import PlanView from './work/PlanView'
import TasksView from './work/TasksView'
import ExecutionView from './work/ExecutionView'
import ChangesView from './work/ChangesView'
import ReviewView from './work/ReviewView'
import RuntimeHistory from './work/RuntimeHistory'
import BottomPanel from '../components/BottomPanel'
import { createProjectionSubscription } from '../state/projection-subscription'

export const WORK_SESSION_TABS = [
  { id: 'conversation', label: 'Conversation' }, { id: 'plan', label: 'Plan' },
  { id: 'tasks', label: 'Tasks' }, { id: 'execution', label: 'Execution' },
  { id: 'changes', label: 'Changes' }, { id: 'review', label: 'Review' }
] as const

type WorkTabId = typeof WORK_SESSION_TABS[number]['id']
export interface WorkSelection { projectId: string; workSessionId: string }

export function sessionPrimaryAction(status: WorkSessionStatus): 'Pause' | 'Resume' | null {
  if (status === 'PAUSED') return 'Resume'
  if (status === 'EXECUTING' || status === 'PLANNING' || status === 'REVIEW' ||
      status === 'REWORK' || status === 'VERIFYING' || status === 'BLOCKED') return 'Pause'
  return null
}

interface Props { selection: WorkSelection | null; onBack(): void }

export default function WorkSessionScreen({ selection, onBack }: Props) {
  const [session, setSession] = useState<WorkSession | null>(null)
  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [projection, setProjection] = useState<WorkProjection | null>(null)
  const [tab, setTab] = useState<WorkTabId>('tasks')
  const [candidates, setCandidates] = useState<readonly RuntimeTargetCandidateSummary[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [commandBusy, setCommandBusy] = useState(false)
  const [panelRefreshKey, setPanelRefreshKey] = useState(0)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [usage, setUsage] = useState<UsageOverview | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)

  const scope = useMemo(() => session?.activeWorkflowRunId && selection ? {
    projectId: selection.projectId, workSessionId: selection.workSessionId,
    workflowRunId: session.activeWorkflowRunId
  } : null, [selection, session?.activeWorkflowRunId])

  const refreshIdentity = useCallback(async () => {
    if (!selection) return
    const [nextProject, nextSession] = await Promise.all([
      window.bs.v2['project.get']({ id: selection.projectId }),
      window.bs.v2['workSession.get']({ id: selection.workSessionId })
    ])
    setProject(nextProject); setSession(nextSession)
  }, [selection])

  const refreshProjection = useCallback(async (requestedTab = tab) => {
    if (!scope) return
    const query = requestedTab === 'conversation' ? window.bs.v2['workflow.conversation']
      : requestedTab === 'plan' ? window.bs.v2['workflow.plan']
        : requestedTab === 'tasks' ? window.bs.v2['workflow.tasks']
          : requestedTab === 'execution' ? window.bs.v2['workflow.execution']
            : requestedTab === 'changes' ? window.bs.v2['workflow.changes']
              : window.bs.v2['workflow.review']
    setProjection(await query(scope))
    setPanelRefreshKey(value => value + 1)
  }, [scope, tab])

  const refreshUsage = useCallback(async () => {
    if (scope) setUsage(await window.bs.v2['usage.get'](scope))
  }, [scope])

  useEffect(() => {
    if (!selection) { setLoading(false); return }
    let current = true
    setLoading(true); setError('')
    refreshIdentity().catch(() => { if (current) setError('Work Session identity is unavailable.') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [refreshIdentity, selection])

  useEffect(() => {
    if (!scope) return
    let current = true
    setProjection(null); setError('')
    refreshProjection(tab).catch(() => { if (current) setError('Work projection is unavailable.') })
    return () => { current = false }
  }, [refreshProjection, scope, tab])
  useEffect(() => { void refreshUsage().catch(() => setError('Usage projection is unavailable.')) }, [refreshUsage])

  useEffect(() => {
    if (!selection || !session) return
    let current = true
    window.bs.v2['workSession.runtimeTargets'](selection).then(value => {
      if (!current) return
      setCandidates(value)
      setCandidateId(existing => value.some(item => item.id === existing && item.selectable)
        ? existing : value.find(item => item.selectable)?.id ?? '')
    }, () => { if (current) setCandidates([]) })
    return () => { current = false }
  }, [selection, session])

  useEffect(() => {
    if (!scope) return
    const subscription = createProjectionSubscription<WorkflowRun>({
      subscribe: callback => window.bs.v2.workflow.subscribe(scope.workflowRunId, callback),
      refetch: async event => ({ ...event,
        payload: await window.bs.v2.workflow.get(scope.workflowRunId) }),
      apply: () => {
        void Promise.all([refreshIdentity(), refreshProjection(tab), refreshUsage()]).catch(() => {
          setError('Work projection refresh failed.')
        })
      },
      onError: () => { setError('Work projection refetch failed after an event gap.') }
    })
    return () => subscription.dispose()
  }, [refreshIdentity, refreshProjection, refreshUsage, scope, tab])

  const runCommand = useCallback(async (operation: () => Promise<unknown>) => {
    setCommandBusy(true); setError('')
    try { await operation(); await refreshIdentity(); await refreshProjection(tab); await refreshUsage() }
    catch { setError('The Work Session command failed. Reload the projection and retry.') }
    finally { setCommandBusy(false) }
  }, [refreshIdentity, refreshProjection, refreshUsage, tab])

  if (!selection) return <WorkMessage title="Choose a Work Session" detail="Open active work from Home or a Project." action={onBack} />
  if (loading) return <WorkMessage title="Loading Work Session" detail="Reading authoritative workflow state…" />
  if (!session || !project) return <WorkMessage title="Work Session unavailable" detail={error || 'No identity projection was returned.'} action={onBack} />
  if (!session.activeWorkflowRunId) return <WorkMessage title={session.title} detail="This Work Session has no active WorkflowRun." action={onBack} />
  if (!scope) return <WorkMessage title={session.title} detail="Work Session scope is unavailable." action={onBack} />

  const primary = sessionPrimaryAction(session.status)
  const selectedCandidate = candidates.find(item => item.id === candidateId)
  const tasks = projection?.tasks.status === 'AVAILABLE' ? projection.tasks.value : []
  const completedTasks = tasks.filter(item => item.status === 'COMPLETED').length
  const activeRuns = projection?.execution.status === 'AVAILABLE'
    ? projection.execution.value.filter(item => item.status === 'RUNNING').length : 0
  const currentEpoch = projection?.runtimeHistory.status === 'AVAILABLE'
    ? projection.runtimeHistory.value.find(item => item.status === 'ACTIVE') : undefined
  const currentCandidate = currentEpoch ? candidates.find(item => item.target.providerId === currentEpoch.providerId &&
    item.target.accountId === currentEpoch.accountId && item.target.modelId === currentEpoch.modelId) : undefined

  return <div className="v2-work-screen">
    <header className="v2-work-header">
      <button type="button" className="v2-icon-button" aria-label="Back to Home" onClick={onBack}><ArrowLeft size={16} /></button>
      <div className="v2-work-heading"><div className="v2-work-title-line"><span>{project.name} /</span><h1>{session.title}</h1><span className="v2-status-pill">{session.status}</span></div>
        <div className="v2-project-meta"><span><Clock3 size={13} />Started {new Date(session.createdAt).toLocaleString()}</span>
          <span>{activeRuns} agents active</span><span>{completedTasks}/{tasks.length} tasks</span><span>{project.defaultBranch}</span></div></div>
      <div className="v2-work-actions">
        {usage ? <div className="v2-usage-summary"><span>{usage.totals.inputTokens} input tokens</span>
          <span>{usage.totals.costKnown ? `$${usage.totals.costUsd.toFixed(4)}` : 'Cost unknown'}</span>
          <span className="v2-status-pill">{usage.decision.decision}</span></div> : null}
        <button type="button" className="v2-btn" onClick={() => setBudgetOpen(true)}>Budget</button>
        <select aria-label="Runtime target" value={candidateId} disabled={commandBusy || !candidates.some(item => item.selectable)}
          onChange={event => setCandidateId(event.target.value)}>
          {!candidates.length ? <option value="">No runtime targets</option> : null}
          {candidates.map(item => <option key={item.id} value={item.id} disabled={!item.selectable}>
            {item.providerName} · {item.modelName} · {item.accountLabel}{item.selectable ? '' : ` (${item.unavailableReason})`}
          </option>)}
        </select>
        <button type="button" className="v2-btn" disabled={!selectedCandidate?.selectable || commandBusy}
          onClick={() => selectedCandidate && void runCommand(() => window.bs.v2['workSession.switchRuntime']({
            projectId: selection.projectId, workSessionId: selection.workSessionId,
            target: selectedCandidate.target, reason: 'user-selected-runtime'
          }))}><RotateCcw size={14} />Switch runtime</button>
        <button type="button" className="v2-btn" onClick={() => setHistoryOpen(true)}><History size={14} />History</button>
        {primary ? <button type="button" className="v2-btn" disabled={commandBusy} onClick={() => void runCommand(() =>
          primary === 'Resume' ? window.bs.v2['workSession.resume'](selection)
            : window.bs.v2['workSession.pause'](selection))}>
          {primary === 'Resume' ? <Play size={14} /> : <Pause size={14} />}{primary}</button> : null}
        {session.status !== 'CANCELLED' && session.status !== 'COMPLETED' ? <button type="button" className="v2-btn v2-btn-danger"
          disabled={commandBusy} onClick={() => setConfirmCancel(true)}>
          <Square size={13} />Cancel</button> : null}
      </div>
    </header>
    {currentCandidate && currentCandidate.target.capabilities.structuredTools !== 'VERIFIED' ? <div className="v2-runtime-warning" role="status">
      Runtime tool capability is {currentCandidate.target.capabilities.structuredTools.toLowerCase()}. Structured tool execution is never inferred from narrated text.
    </div> : null}
    {error ? <div className="v2-command-error" role="alert">{error}</div> : null}
    <nav className="v2-work-tabs" aria-label="Work Session sections">{WORK_SESSION_TABS.map(item => <button type="button" key={item.id}
      aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    <div className="v2-work-content">
      {!projection ? <div className="v2-panel-state" role="status">Loading {WORK_SESSION_TABS.find(item => item.id === tab)?.label}…</div> : null}
      {projection && tab === 'conversation' ? <ConversationView section={projection.conversation} /> : null}
      {projection && tab === 'plan' ? <PlanView section={projection.plan} commandBusy={commandBusy}
        onApprove={() => runCommand(() => window.bs.v2['workflow.approvePlan'](selection))} /> : null}
      {projection && tab === 'tasks' ? <TasksView section={projection.tasks} /> : null}
      {projection && tab === 'execution' ? <ExecutionView section={projection.execution} /> : null}
      {projection && tab === 'changes' ? <ChangesView section={projection.changes} /> : null}
      {projection && tab === 'review' ? <ReviewView section={projection.review} commandBusy={commandBusy}
        onCreateRework={(findingId, title) => runCommand(() => window.bs.v2['workflow.createRework']({
          ...selection, findingIds: [findingId], title
        }))} /> : null}
    </div>
    <BottomPanel projectId={scope.projectId} workSessionId={scope.workSessionId}
      workflowRunId={scope.workflowRunId} refreshKey={panelRefreshKey} />
    {historyOpen && projection ? <RuntimeHistory section={projection.runtimeHistory} onClose={() => setHistoryOpen(false)} /> : null}
    {confirmCancel ? <ConfirmationModal title="Cancel Work Session?"
      detail="Running AgentRuns will be cancelled. Completed task results remain in V2 persistence."
      confirmLabel="Cancel Work Session" busy={commandBusy} onClose={() => setConfirmCancel(false)}
      onConfirm={() => runCommand(async () => { await window.bs.v2['workSession.cancel'](selection); setConfirmCancel(false) })} /> : null}
    {budgetOpen ? <BudgetModal initial={usage?.policy ?? {}} busy={commandBusy}
      onClose={() => setBudgetOpen(false)} onSave={policy => runCommand(async () => {
        await window.bs.v2['usage.updateBudget']({ ...scope, policy }); setBudgetOpen(false)
      })} /> : null}
  </div>
}

function BudgetModal({ initial, busy, onClose, onSave }: { initial: BudgetPolicy; busy: boolean;
  onClose(): void; onSave(policy: BudgetPolicy): Promise<unknown> }) {
  const [cost, setCost] = useState(initial.maxCostUsd?.toString() ?? '')
  const [tokens, setTokens] = useState(initial.maxInputTokens?.toString() ?? '')
  const [requests, setRequests] = useState(initial.maxRequests?.toString() ?? '')
  const policy = (): BudgetPolicy => ({ ...(cost ? { maxCostUsd: Number(cost) } : {}),
    ...(tokens ? { maxInputTokens: Number(tokens) } : {}),
    ...(requests ? { maxRequests: Number(requests) } : {}) })
  return <div className="v2-modal-backdrop" onClick={onClose}><form className="v2-modal" aria-label="Budget policy"
    onClick={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); void onSave(policy()) }}>
    <header><h2>Work Session Budget</h2></header><p>Limits are optional. Empty fields do not create defaults.</p>
    <label>Maximum cost (USD)<input name="maxCostUsd" type="number" min="0.0001" step="0.0001" value={cost} onChange={event => setCost(event.target.value)} /></label>
    <label>Maximum input tokens<input name="maxInputTokens" type="number" min="1" step="1" value={tokens} onChange={event => setTokens(event.target.value)} /></label>
    <label>Maximum requests<input name="maxRequests" type="number" min="1" step="1" value={requests} onChange={event => setRequests(event.target.value)} /></label>
    <footer><button type="button" className="v2-btn" onClick={onClose}>Cancel</button><button className="v2-btn v2-btn-primary" disabled={busy}>Save Budget</button></footer>
  </form></div>
}

function WorkMessage({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return <div className="v2-screen-message" role="status"><strong>{title}</strong><span>{detail}</span>{action ? <button type="button" onClick={action}>Back to Home</button> : null}</div>
}

function ConfirmationModal({ title, detail, confirmLabel, busy, onClose, onConfirm }: { title: string; detail: string;
  confirmLabel: string; busy: boolean; onClose(): void; onConfirm(): Promise<unknown> }) {
  return <div className="v2-modal-backdrop" role="presentation" onClick={onClose}><div className="v2-modal" role="dialog" aria-modal="true" aria-labelledby="v2-confirm-title" onClick={event => event.stopPropagation()}>
    <header><h2 id="v2-confirm-title">{title}</h2></header><p>{detail}</p><footer><button type="button" className="v2-btn" onClick={onClose}>Keep Working</button>
      <button type="button" className="v2-btn v2-btn-danger" disabled={busy} onClick={() => void onConfirm()}>{confirmLabel}</button></footer></div></div>
}
