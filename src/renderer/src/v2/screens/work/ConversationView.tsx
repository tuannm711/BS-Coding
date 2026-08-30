import type { ConversationItemSummary, ProjectionSection } from '../../../../../shared/v2/contracts/ui-projections'

export default function ConversationView({ section }: { section: ProjectionSection<readonly ConversationItemSummary[]> }) {
  if (section.status === 'UNAVAILABLE') return <State text={`Conversation unavailable: ${section.errorCode}`} error />
  if (section.status === 'EMPTY') return <State text="No conversation events yet." />
  return <div className="v2-conversation">{section.value.map(item => item.kind === 'RUNTIME_CHANGED' ?
    <div className="v2-runtime-event" key={item.id}><span>Runtime changed</span><strong>{item.title}</strong><time>{new Date(item.occurredAt).toLocaleString()}</time></div>
    : <article className={`v2-conversation-item v2-conversation-${item.kind.toLowerCase()}`} key={item.id}>
      <header><span>{item.kind === 'TOOL' ? 'Structured tool activity' : item.kind}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></header>
      <h3>{item.title}</h3>{item.body ? <p>{item.body}</p> : null}
      {item.artifactRefs.length ? <small>{item.artifactRefs.length} artifacts</small> : null}
    </article>)}</div>
}

function State({ text, error = false }: { text: string; error?: boolean }) { return <div className="v2-panel-state" role={error ? 'alert' : 'status'}>{text}</div> }
