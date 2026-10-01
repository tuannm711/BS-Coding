import { useEffect, useRef, type KeyboardEvent } from 'react'

const focusable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null)
  useEffect(() => {
    const previous = previousFocus.current
    const dialog = ref.current
    if (dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>(focusable) ?? dialog).focus()
    }
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
    if (dialogs[dialogs.length - 1] !== ref.current) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    if (event.key !== 'Tab') return
    const targets = [...(ref.current?.querySelectorAll<HTMLElement>(focusable) ?? [])].filter(element => element.getClientRects().length > 0)
    const first = targets[0]
    const last = targets[targets.length - 1]
    if (!first) { event.preventDefault(); ref.current?.focus(); return }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus()
    }
  }
  return { ref, onKeyDown }
}
