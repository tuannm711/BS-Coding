import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import QuickMessageButtons from '../../src/renderer/src/components/chat/QuickMessageButtons'

describe('quick message buttons', () => {
  it('uses the configured name and exposes the message as a preview', () => {
    const html = renderToStaticMarkup(<QuickMessageButtons messages={[{ id: 'next', name: 'Next task', message: 'Continue the backlog.' }]} onSend={() => {}} />)
    expect(html).toContain('>Next task</button>')
    expect(html).toContain('title="Continue the backlog."')
  })

  it('disables sending while the session requires an answer to a prompt', () => {
    const html = renderToStaticMarkup(<QuickMessageButtons messages={[{ id: 'next', name: 'Next', message: 'Continue' }]} onSend={() => {}} disabled />)
    expect(html).toContain('disabled=""')
  })
})
