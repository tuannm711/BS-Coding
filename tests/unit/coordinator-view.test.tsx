import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoordinatorSurface, coordinationTiles } from '../../src/renderer/src/components/coordinator/CoordinatorView'
import type { AgentConfig, CoordinationAssignment } from '../../src/shared/types'

const assignment = (patch: Partial<CoordinationAssignment> = {}): CoordinationAssignment => ({
  id: 'as1', coordinatorId: 'boss-id', workerId: 'w1', workerName: 'anti-gemini-flash',
  sessionId: 's1', task: 'update the readme', startedAt: 1, state: 'running', ...patch
})

const agent = (patch: Partial<AgentConfig> = {}): AgentConfig =>
  ({ id: 'w1', name: 'anti-gemini-flash', templateId: 'bs', cwd: '/proj', kind: 'native', ...patch })

describe('coordinationTiles', () => {
  it('gives each worker one tile, newest assignment first', () => {
    const tiles = coordinationTiles(
      [assignment({ id: 'a', workerId: 'w1' }), assignment({ id: 'b', workerId: 'w2' })],
      [agent(), agent({ id: 'w2', name: 'anti-claude-opus' })]
    )
    expect(tiles.map(tile => tile.agent.name)).toEqual(['anti-claude-opus', 'anti-gemini-flash'])
  })

  it('does not open a second tile for a worker given a second task', () => {
    // The tile is that agent's session, and the session already holds both
    // exchanges in order.
    const tiles = coordinationTiles(
      [assignment({ id: 'a', sessionId: 's1' }), assignment({ id: 'b', sessionId: 's1' })],
      [agent()]
    )
    expect(tiles).toHaveLength(1)
    expect(tiles[0].assignment.id).toBe('b')
  })

  it('carries the session the task ran in, so the tile can render it live', () => {
    expect(coordinationTiles([assignment({ sessionId: 'session-42' })], [agent()])[0].sessionId)
      .toBe('session-42')
  })

  it('skips a worker that is no longer in the project', () => {
    expect(coordinationTiles([assignment({ workerId: 'gone' })], [agent()])).toEqual([])
  })
})

describe('CoordinatorSurface', () => {
  const surface = (props: Partial<React.ComponentProps<typeof CoordinatorSurface>> = {}) =>
    renderToStaticMarkup(React.createElement(CoordinatorSurface, {
      projectPath: '/proj', coordinator: null, coordinatorSessionId: null,
      agents: [], assignments: [], ...props
    }))

  it('routes an empty board to Fleet rather than offering a second picker', () => {
    // One place gives the role. A picker here would be a second control doing
    // the same job, which is how the project ended up with two coordinators.
    const markup = surface({ onOpenFleet: () => {} })
    expect(markup).toContain('Open Fleet')
    expect(markup).not.toContain('<select')
  })

  it('says where delegated work will appear before any exists', () => {
    // An empty screen is an invitation, and this one has to explain that the
    // tiles arrive on their own rather than needing to be opened.
    const markup = surface({
      coordinator: agent({ id: 'boss', name: 'bs', mode: 'coordinate' }),
      coordinatorSessionId: null
    })
    expect(markup).toContain('appears here as it runs')
  })
})
