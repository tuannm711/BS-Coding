import { memo } from 'react'
import { contextLevel, contextPercent } from '@shared/usage'
import type { ContextInfo } from '@shared/types'

interface Props {
  tokens: number | null
  limit: number | null
  limitSource?: ContextInfo['limitSource']
  compactThreshold: number | null
  cost: number
  sessionTokens?: { input: number; output: number } | null
}

export default memo(function ContextFooter({ tokens, limit, limitSource, compactThreshold, cost, sessionTokens }: Props) {
  const pct = tokens === null ? null : contextPercent(tokens, limit)
  const level = tokens === null ? 'normal' : contextLevel(tokens, compactThreshold)
  return (
    <div className="context-footer-stack">
      <div className={`context-footer ${level}`} title="Last provider-reported request: prompt and generated tokens; unavailable when the provider omits usage.">
        <span className="context-footer-label">context</span>
        <span>{tokens === null ? '—' : tokens.toLocaleString()}</span>
        {pct !== null && <span title={`${limitSource === 'configured' ? 'Configured context budget' : 'Published model context limit'}: ${limit?.toLocaleString()} tokens`}>({pct}%)</span>}
        {level === 'danger' && <span className="context-footer-note">· compacting soon</span>}
        {cost > 0 && <span className="context-footer-cost">· ${cost.toFixed(4)}</span>}
      </div>
      {sessionTokens && (
        <div className="context-footer-tokens" data-testid="context-session-tokens" title="Cumulative provider-reported tokens recorded in this session; includes cached input. Requests without usage are not counted.">
          <span className="context-footer-label">Tokens</span>
          <span>{(sessionTokens.input + sessionTokens.output).toLocaleString()}</span>
          <span className="context-footer-dim">
            ({sessionTokens.input.toLocaleString()} in / {sessionTokens.output.toLocaleString()} out)
          </span>
        </div>
      )}
    </div>
  )
})
