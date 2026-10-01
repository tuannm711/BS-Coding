import { useId, type ReactNode } from 'react'
import { useDialogFocus } from './useDialogFocus'

interface Props {
  title: string
  onClose(): void
  children: ReactNode
  submitLabel?: string
  onSubmit?(): void
  submitDisabled?: boolean
  showDefaultActions?: boolean
}

export default function Modal({
  title, onClose, children, submitLabel = 'Save', onSubmit, submitDisabled = false, showDefaultActions = true
}: Props) {
  const titleId = useId()
  const focus = useDialogFocus(onClose)

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} {...focus}>
        <h3 id={titleId}>{title}</h3>
        <button className="dialog-close" aria-label="Close" onClick={onClose}>✕</button>
        {children}
        {showDefaultActions && (
          <div className="dialog-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            {onSubmit && (
              <button className="btn primary submit" disabled={submitDisabled} onClick={onSubmit}>
                {submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
