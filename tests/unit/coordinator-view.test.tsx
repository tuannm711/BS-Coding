import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoordinatorBoard } from '../../src/renderer/src/components/coordinator/CoordinatorView'
import type { CoordinationAssignment } from '../../src/shared/types'

const assignment = (patch: Partial<CoordinationAssignment> = {}): CoordinationAssignment => ({
  id: 'as1', coordinatorId: 'boss-id', workerId: 'w1', workerName: 'anti-gemini-flash',
  task: 'update the readme', startedAt: 1, state: 'running', ...patch
})

const board = (props: Partial<React.ComponentProps<typeof CoordinatorBoard>> = {}) =>
  renderToStaticMarkup(React.createElement(CoordinatorBoard, {
    coordinatorName: 'boss', messages: [], assignments: [], running: false,
    onSend: () => {}, onStop: () => {}, onOpenWorker: () => {}, ...props
  }))

describe('CoordinatorBoard', () => {
  it('routes an empty board to Fleet rather than offering a second picker', () => {
    // One place gives the role. A picker here would be a second control doing
    // the same job, which is how the project ended up with two coordinators.
    const markup = board({ coordinatorName: null, onOpenFleet: () => {} })
    expect(markup).toContain('Open Fleet')
    expect(markup).not.toContain('<select')
  })

  it('lists an assignment with its worker, task and state', () => {
    const markup = board({ assignments: [assignment()] })
    expect(markup).toContain('anti-gemini-flash')
    expect(markup).toContain('update the readme')
    expect(markup).toContain('running')
  })

  it('shows the result once an assignment completes', () => {
    const markup = board({ assignments: [assignment({ state: 'completed', result: '3 files changed' })] })
    expect(markup).toContain('3 files changed')
  })

  it('says so when the project has no coordinator', () => {
    // Rendering an empty board would look like a coordinator with nothing to do.
    expect(board({ coordinatorName: null })).toContain('No agent is coordinating')
  })

  it('does not render tool detail', () => {
    // The line that keeps this from becoming the chat frame it exists to
    // replace: to read the detail, open the worker's session.
    const markup = board({
      messages: [{ id: 'm1', role: 'assistant', text: 'planning', createdAt: 1 }]
    })
    expect(markup).toContain('planning')
    expect(markup).not.toContain('tool-call')
  })
})
