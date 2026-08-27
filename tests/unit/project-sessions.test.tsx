import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ProjectSessions, { groupSessions } from '../../src/renderer/src/components/sidebar/ProjectSessions'
import type { ProjectSessionSummary } from '../../src/shared/types'

const session = (patch: Partial<ProjectSessionSummary> = {}): ProjectSessionSummary => ({
  id: 's1', projectPath: '/proj', title: 'Sửa quota card', messageCount: 2,
  createdAt: 1, updatedAt: 2, kind: 'work', ...patch
})

const panel = (props: Partial<ProjectSessionsProps> = {}) =>
  renderToStaticMarkup(React.createElement(ProjectSessions, {
    sessions: [], activeSessionId: null,
    onSelect: () => {}, onCreate: () => {}, onDelete: () => {}, ...props
  }))
type ProjectSessionsProps = React.ComponentProps<typeof ProjectSessions>

describe('groupSessions', () => {
  it('puts coordination first', () => {
    // The coordinated run is what you are watching when you have one.
    const groups = groupSessions([session(), session({ id: 's2', kind: 'coordination' })])
    expect(groups.map(group => group.kind)).toEqual(['coordination', 'work'])
  })

  it('drops an empty group rather than showing a heading over nothing', () => {
    expect(groupSessions([session()]).map(group => group.kind)).toEqual(['work'])
    expect(groupSessions([])).toEqual([])
  })

  it('treats a session with no kind as work', () => {
    // Sessions stored before the field existed have none.
    expect(groupSessions([session({ kind: undefined })])[0].kind).toBe('work')
  })
})

describe('ProjectSessions', () => {
  it('marks the session that has a turn running', () => {
    // The question the dropdown could not answer at all.
    const markup = panel({ sessions: [session({ running: true })] })
    expect(markup).toContain('aria-label="running"')
  })

  it('does not mark an idle session', () => {
    expect(panel({ sessions: [session()] })).not.toContain('aria-label="running"')
  })

  it('names both groups when both have sessions', () => {
    const markup = panel({
      sessions: [session(), session({ id: 's2', kind: 'coordination', title: 'Khảo sát codebase' })]
    })
    expect(markup).toContain('Coordination')
    expect(markup).toContain('Khảo sát codebase')
    expect(markup).toContain('Work')
  })

  it('invites the first session when there are none', () => {
    expect(panel()).toContain('No sessions yet')
  })
})
