import { describe, expect, it } from 'vitest'
import { appearanceVariables, contrastRatio } from '../../src/shared/appearance'

describe('appearance colors', () => {
  it('keeps keyboard focus visible when the chosen button and background are both white', () => {
    const vars = appearanceVariables({ background: '#ffffff', text: '#000000', button: '#ffffff' })
    expect(contrastRatio(vars['--accent'], '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(vars['--focus-ring'].slice(0, 7)).toBe(vars['--accent'])
    expect(vars['--accent-border'].slice(0, 7)).toBe(vars['--accent'])
    expect(contrastRatio(vars['--button-bg'], vars['--button-text'])).toBeGreaterThanOrEqual(4.5)
  })
})
