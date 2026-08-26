import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  accountLabel: string
  available: number
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

// Spending a credit cannot be undone and the user holds very few, so this asks
// before it happens rather than after.
export default function ResetCreditDialog({ accountLabel, available, busy = false, onConfirm, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Spend a reset credit">
        <h4>Spend a reset credit?</h4>
        <p className="settings-hint">
          This resets both the weekly and the 5-hour quota on{' '}
          <strong>{accountLabel}</strong>. It spends one of {available} and cannot be undone.
        </p>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Spending…' : 'Spend one credit'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
