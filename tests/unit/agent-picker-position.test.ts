import { describe, expect, it } from 'vitest'
import { positionAgentPicker } from '../../src/renderer/src/components/chat/agent-picker-position'

describe('Agent picker portal positioning', () => {
  it('opens below the trigger when enough viewport space remains', () => {
    expect(positionAgentPicker(
      { left: 100, top: 100, right: 240, bottom: 132, width: 140, height: 32 },
      { width: 900, height: 768 },
      { width: 270, preferredHeight: 240, gap: 4, margin: 8 }
    )).toEqual({ left: 100, top: 136, maxHeight: 240, placement: 'bottom' })
  })

  it('flips above and clamps to the right viewport edge', () => {
    const position = positionAgentPicker(
      { left: 760, top: 730, right: 900, bottom: 762, width: 140, height: 32 },
      { width: 900, height: 768 },
      { width: 270, preferredHeight: 300, gap: 4, margin: 8 }
    )

    expect(position).toEqual({ left: 622, top: 426, maxHeight: 300, placement: 'top' })
  })

  it('constrains menu height inside a short viewport', () => {
    const position = positionAgentPicker(
      { left: 2, top: 70, right: 142, bottom: 102, width: 140, height: 32 },
      { width: 240, height: 180 },
      { width: 270, preferredHeight: 300, gap: 4, margin: 8 }
    )

    expect(position.left).toBe(8)
    expect(position.top).toBe(106)
    expect(position.maxHeight).toBe(66)
    expect(position.placement).toBe('bottom')
  })
})
