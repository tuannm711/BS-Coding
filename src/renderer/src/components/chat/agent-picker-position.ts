export interface DOMRectLike {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface AgentPickerPosition {
  left: number
  top: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

export function positionAgentPicker(
  anchor: DOMRectLike,
  viewport: { width: number; height: number },
  menu: { width: number; preferredHeight: number; gap: number; margin: number }
): AgentPickerPosition {
  const spaceBelow = Math.max(0, viewport.height - anchor.bottom - menu.gap - menu.margin)
  const spaceAbove = Math.max(0, anchor.top - menu.gap - menu.margin)
  const placement: AgentPickerPosition['placement'] = spaceBelow >= Math.min(menu.preferredHeight, spaceAbove) ? 'bottom' : 'top'
  const available = placement === 'bottom' ? spaceBelow : spaceAbove
  const maxHeight = Math.min(menu.preferredHeight, available)
  const maxLeft = Math.max(menu.margin, viewport.width - menu.width - menu.margin)
  const left = Math.max(menu.margin, Math.min(anchor.left, maxLeft))
  const top = placement === 'bottom'
    ? Math.min(viewport.height - menu.margin, anchor.bottom + menu.gap)
    : Math.max(menu.margin, anchor.top - menu.gap - maxHeight)
  return { left, top, maxHeight, placement }
}
