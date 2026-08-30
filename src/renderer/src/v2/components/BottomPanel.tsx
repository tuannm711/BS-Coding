import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { BottomPanelProjection } from '../../../../shared/v2/contracts/ui-projections'

const BOTTOM_TABS = ['Terminal', 'Tests', 'Problems', 'Logs', 'Output'] as const
type BottomTab = typeof BOTTOM_TABS[number]

interface Props { projectId: string; workSessionId: string; workflowRunId: string; refreshKey: number }

export default function BottomPanel({ projectId, workSessionId, workflowRunId, refreshKey }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<BottomTab>('Terminal')
  const [projection, setProjection] = useState<BottomPanelProjection | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let current = true
    window.bs.v2['workflow.bottomPanel']({ projectId, workSessionId, workflowRunId, limit: 100 })
      .then(value => { if (current) setProjection(value) }, () => { if (current) setError(true) })
    return () => { current = false }
  }, [projectId, refreshKey, workSessionId, workflowRunId])

  const problemCount = projection?.problems.status === 'AVAILABLE' ? projection.problems.value.length : 0
  return <section className="v2-bottom-panel" data-testid="v2-bottom-panel" data-expanded={expanded}>
    <div className="v2-bottom-tabs">{BOTTOM_TABS.map(item => <button type="button" key={item}
      aria-current={expanded && tab === item ? 'page' : undefined}
      onClick={() => { setTab(item); setExpanded(true) }}>{item}
      {item === 'Problems' && problemCount > 0 ? <span>{problemCount}</span> : null}</button>)}
      <button type="button" className="v2-bottom-toggle" aria-label={expanded ? 'Collapse bottom panel' : 'Expand bottom panel'}
        onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
    </div>
    {expanded ? <div className="v2-bottom-content">{error ? <BottomState text="Bottom panel projection is unavailable." error />
      : !projection ? <BottomState text="Loading bottom panel…" />
        : tab === 'Terminal' ? <TerminalContent section={projection.terminals} />
          : tab === 'Tests' ? <TestsContent section={projection.tests} />
            : tab === 'Problems' ? <ProblemsContent section={projection.problems} />
              : tab === 'Logs' ? <LogsContent section={projection.logs} />
                : <OutputContent section={projection.output} />}</div> : null}
  </section>
}

function TerminalContent({ section }: { section: BottomPanelProjection['terminals'] }) {
  if (section.status !== 'AVAILABLE') return <BottomState text={section.status === 'EMPTY' ? 'No terminal sessions.' : `Terminal unavailable: ${section.errorCode}`} error={section.status === 'UNAVAILABLE'} />
  return <div className="v2-bottom-list">{section.value.map(item => <div key={item.id}><code>{item.title}</code><span>{item.status}</span></div>)}</div>
}
function TestsContent({ section }: { section: BottomPanelProjection['tests'] }) {
  if (section.status !== 'AVAILABLE') return <BottomState text={section.status === 'EMPTY' ? 'No test runs recorded.' : `Tests unavailable: ${section.errorCode}`} error={section.status === 'UNAVAILABLE'} />
  return <div className="v2-bottom-list">{section.value.map(item => <div key={item.id}><strong>{item.id}</strong><span>{item.status}</span></div>)}</div>
}
function ProblemsContent({ section }: { section: BottomPanelProjection['problems'] }) {
  if (section.status !== 'AVAILABLE') return <BottomState text={section.status === 'EMPTY' ? 'No problems reported.' : `Problems unavailable: ${section.errorCode}`} error={section.status === 'UNAVAILABLE'} />
  return <div className="v2-bottom-list">{section.value.map(item => <div key={item.id}><span><strong>{item.severity}</strong> {item.message}</span><small>{item.kind}</small></div>)}</div>
}
function LogsContent({ section }: { section: BottomPanelProjection['logs'] }) {
  if (section.status !== 'AVAILABLE') return <BottomState text={section.status === 'EMPTY' ? 'No structured logs.' : `Logs unavailable: ${section.errorCode}`} error={section.status === 'UNAVAILABLE'} />
  return <div className="v2-bottom-list v2-bottom-mono">{section.value.map(item => <div key={item.id}><time>{new Date(item.occurredAt).toLocaleTimeString()}</time><strong>{item.level}</strong><span>{item.message}</span></div>)}</div>
}
function OutputContent({ section }: { section: BottomPanelProjection['output'] }) {
  if (section.status !== 'AVAILABLE') return <BottomState text={section.status === 'EMPTY' ? 'No workflow output.' : `Output unavailable: ${section.errorCode}`} error={section.status === 'UNAVAILABLE'} />
  return <div className="v2-bottom-list">{section.value.map(item => <div key={item.id}><span>{item.preview}</span>{item.artifactId ? <code>{item.artifactId}</code> : null}</div>)}</div>
}
function BottomState({ text, error = false }: { text: string; error?: boolean }) { return <div className="v2-bottom-state" role={error ? 'alert' : 'status'}>{text}</div> }
