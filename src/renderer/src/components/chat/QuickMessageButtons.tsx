import { memo } from 'react'
import type { QuickMessage } from '@shared/types'

interface Props {
  messages: QuickMessage[]
  onSend: (message: string) => void
  disabled?: boolean
}

function QuickMessageButtons({ messages, onSend, disabled = false }: Props) {
  return <div className="quick-message-buttons" role="group" aria-label="Quick messages">
    {messages.map(message => <button key={message.id} type="button" className="btn small quick-message-button"
      title={message.message} disabled={disabled} onClick={() => onSend(message.message)}>{message.name}</button>)}
  </div>
}

export default memo(QuickMessageButtons)
