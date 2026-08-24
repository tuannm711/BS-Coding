import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import AgentPicker from '../../src/renderer/src/components/chat/AgentPicker'

describe('shared-session ChatPanel', () => {
  it('renders an accessible locked Agent picker with its reason', () => {
    const html = renderToStaticMarkup(<AgentPicker
      agents={[{ id: 'a', name: 'Builder' }, { id: 'b', name: 'Reviewer' }]}
      value="a"
      disabled
      disabledReason="Agent locked while running"
      onChange={vi.fn()}
    />)
    expect(html).toContain('aria-disabled="true"')
    expect(html).toContain('Agent locked while running')
  })

  it('keys transcript loading by project and session, not selected Agent', () => {
    const source = readFileSync(path.resolve('src/renderer/src/components/chat/ChatPanel.tsx'), 'utf-8')
    expect(source).toContain('window.api.listSessionTranscript(projectPath, sessionId)')
    expect(source).toMatch(/const loadTranscript = useCallback\([\s\S]*?\}, \[projectPath, sessionId\]\)/)
    expect(source).not.toContain('<ChatPanel\n              key={id}')
  })
})
