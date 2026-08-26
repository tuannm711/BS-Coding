import { memo } from 'react'
import type { ChatMessage, Command, ImageAttachment, ToolCallData, TurnExecutionSnapshot } from '@shared/types'
import ToolCallCard from './ToolCallCard'
import MarkdownText from './MarkdownText'

// Splits user text on @path tokens and highlights them, matching the main-side
// @reference syntax (bare or quoted forms).
const MENTION_SPLIT_RE = /(@[\w./\\-]+)/g
// Leading slash command token ("/init", "/review", ...).
const SLASH_RE = /^(\/[\w-]+)/

export type FeedItem =
  | { kind: 'message'; id: string; role: ChatMessage['role']; text: string; reasoning?: string; images?: ImageAttachment[]; execution?: TurnExecutionSnapshot }
  | { kind: 'tool'; id: string; call: ToolCallData }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'compaction'; id: string; failed?: boolean }
  | { kind: 'notice'; id: string; text: string }
  | { kind: 'subagent'; taskId: string; subagentType?: string; text: string; reasoning?: string; result?: string; background?: boolean; tools: string[]; state: 'running' | 'completed' | 'cancelled' | 'error' }

export function feedItemKey(item: FeedItem): string {
  return item.kind === 'subagent' ? item.taskId : item.id
}

export function TurnAttributionBadge({ execution }: { execution: TurnExecutionSnapshot }) {
  const model = execution.modelLabel ?? execution.modelId ?? 'Model not reported'
  const provider = execution.providerId ?? 'Provider not reported'
  const account = execution.accountLabel ?? execution.accountId ?? 'Account not reported'
  return (
    <span className="chat-turn-agent-badge" title={`${provider} · ${account}`}>
      {execution.agentName} · {model}
    </span>
  )
}

function MentionText({ text, commands }: { text: string; commands: Command[] }) {
  const m = SLASH_RE.exec(text)
  const slash = m && commands.some(c => c.name === m[1].slice(1)) ? m[1] : null
  const rest = slash !== null ? text.slice(slash.length) : text
  const parts = rest.split(MENTION_SPLIT_RE)
  return (
    <div className="chat-text">
      {slash && <span className="chat-slash">{slash}</span>}
      {parts.map((part, i) =>
        part.startsWith('@')
          ? <span key={i} className="chat-mention">{part}</span>
          : part
      )}
    </div>
  )
}

// Owns the per-message subtree so streamed deltas only re-render the message
// that changed, not the whole feed. Props are primitives or stable state
// references (commands), so React.memo works.
const FeedMessage = memo(function FeedMessage({ messageId, role, text, reasoning, images, execution, commands, onOpenImage, onOpenFile }: {
  messageId: string
  role: ChatMessage['role']
  text: string
  reasoning?: string
  images?: ImageAttachment[]
  execution?: TurnExecutionSnapshot
  commands: Command[]
  onOpenImage?: (dataUrl: string) => void
  onOpenFile?: (path: string) => void
}) {
  return (
    <div className={`chat-msg ${role}`} data-chat-message-id={messageId}>
      {role === 'assistant' ? (
        <>
          {execution ? <TurnAttributionBadge execution={execution} /> : null}
          {reasoning ? (
            <details className="chat-reasoning">
              <summary>Thinking</summary>
              <div className="chat-reasoning-text">{reasoning}</div>
            </details>
          ) : null}
          {text.trim() !== '' && <MarkdownText text={text} onOpenFile={onOpenFile} />}
        </>
      ) : (
        <>
          {images && images.length > 0 && (
            <div className="chat-msg-images">
              {images.map(img => (
                <img
                  key={img.id}
                  src={img.dataUrl}
                  alt={img.name}
                  className="chat-thumb"
                  onClick={() => onOpenImage?.(img.dataUrl)}
                />
              ))}
            </div>
          )}
          {text.trim() !== '' && <MentionText text={text} commands={commands} />}
        </>
      )}
    </div>
  )
})

export interface FeedRowProps {
  item: FeedItem
  commands: Command[]
  onOpenImage: (dataUrl: string) => void
  onOpenFile: (path: string) => void
  onOpenSubagent: (taskId: string) => void
}

// One transcript row. Holds no state, so every kind can be asserted with
// renderToStaticMarkup — the notice row shipped in v1.1.6 without ever
// having been rendered.
export function FeedRow({ item, commands, onOpenImage, onOpenFile, onOpenSubagent }: FeedRowProps) {
  if (item.kind === 'notice') {
    return <div className="chat-notice">{item.text}</div>
  }
  if (item.kind === 'compaction') {
    return (
      <div className={`chat-compacted ${item.failed ? 'failed' : ''}`}>
        {item.failed ? 'Context compaction failed' : 'Context compacted'}
      </div>
    )
  }
  if (item.kind === 'message') {
    // An assistant message is created empty and filled by streamed deltas;
    // rendering it before the first delta flashes an empty bubble.
    if (item.role === 'assistant' && item.text.trim() === '' && !item.reasoning) return null
    return (
      <FeedMessage
        messageId={item.id}
        role={item.role}
        text={item.text}
        reasoning={item.reasoning}
        images={item.images}
        execution={item.execution}
        commands={commands}
        onOpenImage={onOpenImage}
        onOpenFile={onOpenFile}
      />
    )
  }
  if (item.kind === 'tool') {
    return <ToolCallCard call={item.call} />
  }
  if (item.kind === 'subagent') {
    return (
      <div
        className={`subagent ${item.state === 'running' ? 'running' : ''} ${item.background ? 'background' : ''}`}
        onClick={() => onOpenSubagent(item.taskId)}
        title="Open live view"
      >
        <div className="subagent-head">
          <span className="subagent-name">sub-agent{item.subagentType ? ` (${item.subagentType})` : ''}</span>
          {item.background && <span className="subagent-bg">bg</span>}
          <span className={`subagent-state state-${item.state}`}>{item.state}</span>
        </div>
        {item.tools.length > 0 && (
          <div className="subagent-tools">
            {item.tools.map(t => <code key={t}>{t}</code>)}
          </div>
        )}
        {item.text && <div className="subagent-text">{item.text}</div>}
        {item.state === 'running' && <div className="subagent-running">…</div>}
      </div>
    )
  }
  return <div className="chat-error">{item.text}</div>
}
