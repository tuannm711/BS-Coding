import { describe, expect, it } from 'vitest'
import {
  AgentSettingsProjectionSchema,
  BottomPanelProjectionSchema,
  ProjectDetailProjectionSchema,
  ProjectSummarySchema,
  WorkProjectionSchema
} from '../../../src/shared/v2/schemas/ui-projections'

const now = '2026-08-30T00:00:00.000Z'

describe('P15 backend projection contracts', () => {
  it('requires stable project identity, activity ordering fields and revision', () => {
    expect(ProjectSummarySchema.safeParse({ id: 'p', name: 'PMS' }).success).toBe(false)
    expect(ProjectSummarySchema.parse({
      id: 'p', name: 'PMS', repoPath: 'C:/repo', defaultBranch: 'master',
      activeWorkCount: 2, updatedAt: now, revision: 4
    })).toMatchObject({ id: 'p', activeWorkCount: 2, revision: 4 })
  })

  it('accepts typed unavailable sections but rejects undeclared raw data', () => {
    const detail = {
      project: { id: 'p', name: 'PMS', repoPath: 'C:/repo', defaultBranch: 'master',
        activeWorkCount: 0, updatedAt: now, revision: 1 },
      revision: 1,
      workSessions: { status: 'EMPTY' },
      workspace: { status: 'UNAVAILABLE', errorCode: 'WORKSPACE_OFFLINE' },
      git: { status: 'UNAVAILABLE', errorCode: 'GIT_OFFLINE' },
      agents: { status: 'EMPTY' }, skills: { status: 'EMPTY' }, mcp: { status: 'EMPTY' }
    }
    expect(ProjectDetailProjectionSchema.safeParse(detail).success).toBe(true)
    expect(ProjectDetailProjectionSchema.safeParse({ ...detail, rawHandle: 1 }).success).toBe(false)
  })

  it('keeps every Work tab as a typed projection section', () => {
    expect(WorkProjectionSchema.safeParse({
      projectId: 'p', workSessionId: 'ws', workflowRunId: 'wf', revision: 4,
      conversation: { status: 'EMPTY' }, plan: { status: 'EMPTY' },
      tasks: { status: 'UNAVAILABLE', errorCode: 'OFFLINE' },
      execution: { status: 'EMPTY' }, changes: { status: 'EMPTY' },
      review: { status: 'EMPTY' }, runtimeHistory: { status: 'EMPTY' }
    }).success).toBe(true)
  })

  it('does not permit secret values or raw process handles in settings and bottom panel DTOs', () => {
    expect(AgentSettingsProjectionSchema.safeParse({
      projectId: 'p', revision: 1, agents: [], providerAccounts: [],
      globalSettings: { providerCredentials: { configured: true } },
      rawSecret: 'secret'
    }).success).toBe(false)
    expect(BottomPanelProjectionSchema.safeParse({
      projectId: 'p', workflowRunId: 'wf', revision: 1,
      terminals: { status: 'AVAILABLE', value: [{ id: 'pty', title: 'Tests', status: 'RUNNING' }] },
      tests: { status: 'EMPTY' }, problems: { status: 'EMPTY' },
      logs: { status: 'EMPTY' }, output: { status: 'EMPTY' }, process: 42
    }).success).toBe(false)
  })
})
