import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { positionAgentPicker, type AgentPickerPosition } from './agent-picker-position'

export interface AgentPickerOption {
  id: string
  name: string
  model?: string
}

interface Props {
  agents: AgentPickerOption[]
  value: string
  onChange: (agentId: string) => void
  disabled?: boolean
  disabledReason?: string
}

const MENU_WIDTH = 270
const MENU_HEIGHT = 300
const MENU_GAP = 4
const VIEWPORT_MARGIN = 8

export default function AgentPicker({ agents, value, onChange, disabled = false, disabledReason }: Props) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [position, setPosition] = useState<AgentPickerPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = useMemo(() => agents.find(agent => agent.id === value), [agents, value])
  const currentIndex = Math.max(0, agents.findIndex(agent => agent.id === value))

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) requestAnimationFrame(() => {
      const trigger = triggerRef.current ?? document.querySelector<HTMLButtonElement>('.agent-picker-trigger')
      trigger?.focus()
    })
  }, [])

  const select = useCallback((index: number) => {
    const agent = agents[index]
    if (!agent) return
    onChange(agent.id)
    close(true)
  }, [agents, close, onChange])

  const reposition = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect()
    if (!anchor) return
    const preferredHeight = Math.min(MENU_HEIGHT, menuRef.current?.scrollHeight ?? MENU_HEIGHT)
    setPosition(positionAgentPicker(anchor, { width: window.innerWidth, height: window.innerHeight }, {
      width: MENU_WIDTH,
      preferredHeight,
      gap: MENU_GAP,
      margin: VIEWPORT_MARGIN
    }))
  }, [])

  const show = useCallback(() => {
    if (disabled) return
    setActiveIndex(currentIndex)
    setOpen(true)
  }, [currentIndex, disabled])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const frame = requestAnimationFrame(() => {
      reposition()
      menuRef.current?.focus()
    })
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [close, open])

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => agents.length === 0 ? 0 : (index + 1) % agents.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => agents.length === 0 ? 0 : (index - 1 + agents.length) % agents.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, agents.length - 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(activeIndex)
    }
  }

  const menu = open ? <div
    ref={menuRef}
    className="agent-picker-menu agent-picker-menu-portal"
    role="listbox"
    tabIndex={-1}
    aria-label="Select Agent"
    aria-activedescendant={agents[activeIndex] ? `agent-picker-option-${agents[activeIndex].id}` : undefined}
    onKeyDown={onMenuKeyDown}
    style={{
      left: position?.left ?? VIEWPORT_MARGIN,
      top: position?.top ?? VIEWPORT_MARGIN,
      maxHeight: position?.maxHeight ?? MENU_HEIGHT,
      visibility: position ? 'visible' : 'hidden'
    }}
  >
    {agents.map((agent, index) => (
      <button
        id={`agent-picker-option-${agent.id}`}
        key={agent.id}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={agent.id === value}
        className={`agent-picker-item${agent.id === value ? ' active' : ''}${index === activeIndex ? ' focused' : ''}`}
        onPointerMove={() => setActiveIndex(index)}
        onClick={() => select(index)}
      >
        <strong>{agent.name}</strong>
        <span>{agent.model ?? 'Model configured in Agents'}</span>
      </button>
    ))}
    {agents.length === 0 ? <span className="model-empty">No agents configured</span> : null}
  </div> : null

  const reasonId = disabled && disabledReason ? 'agent-picker-disabled-reason' : undefined
  return (
    <div className="agent-picker">
      <button
        ref={triggerRef}
        className="agent-picker-trigger"
        type="button"
        onClick={() => disabled ? undefined : (open ? close(false) : show())}
        onKeyDown={event => {
          if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            show()
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled}
        aria-describedby={reasonId}
        title={disabledReason}
      >
        <span className="agent-picker-label">Agent</span>
        <strong>{current?.name ?? 'Select Agent'}</strong>
        <span className="model-caret" aria-hidden="true">▾</span>
      </button>
      {reasonId ? <span id={reasonId} className="sr-only">{disabledReason}</span> : null}
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
