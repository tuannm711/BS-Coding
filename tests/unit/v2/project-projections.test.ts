import { describe, expect, it } from 'vitest'
import { createProjectProjectionService } from '../../../src/main/v2/application/projections/project-projections'
import type { ProjectionReadPort } from '../../../src/main/v2/application/ports/projection-read-port'
import type { ProjectionSupportPort } from '../../../src/main/v2/application/ports/projection-support-port'
import type { Project, WorkSession } from '../../../src/shared/v2/contracts/domain'

const older = '2026-08-29T00:00:00.000Z'
const newer = '2026-08-30T00:00:00.000Z'
const projects: Project[] = [
  { id: 'older', name: 'Older', repoPath: 'C:/older', defaultBranch: 'master',
    instructionsRef: 'AGENTS.md', createdAt: older, updatedAt: older },
  { id: 'recent', name: 'Recent', repoPath: 'C:/recent', defaultBranch: 'main',
    instructionsRef: 'AGENTS.md', createdAt: older, updatedAt: newer }
]
const sessions: WorkSession[] = [
  { id: 'ws-running', projectId: 'recent', title: 'Run', goal: 'Run', status: 'EXECUTING',
    createdAt: older, updatedAt: newer },
  { id: 'ws-done', projectId: 'recent', title: 'Done', goal: 'Done', status: 'COMPLETED',
    createdAt: older, updatedAt: older }
]

function reads(): ProjectionReadPort {
  return {
    getProject: async id => projects.find(project => project.id === id) ?? null,
    listProjects: async () => projects,
    getWorkSessionOwnedByProject: async () => null,
    listWorkSessionsByProject: async id => id === 'recent' ? sessions : [],
    getWorkflowOwnedByProject: async () => null,
    listTasksByWorkflow: async () => [], listTaskRunsByWorkflow: async () => [],
    listAgentDefinitionsByProject: async id => id === 'recent' ? [{
      id: 'agent', projectId: id, name: 'Reviewer', role: 'Reviewer',
      createdAt: older, updatedAt: newer
    }] : [],
    listAgentRunsByWorkflow: async () => [], listRuntimeEpochsByWorkflow: async () => [],
    listReviewsByWorkflow: async () => [], listFindingsByWorkflow: async () => [],
    listArtifactsByProject: async () => []
  }
}

function support(): ProjectionSupportPort {
  return {
    getWorkspace: async projectId => ({ status: 'AVAILABLE', value: {
      id: `workspace-${projectId}`, path: `C:/${projectId}`, mode: 'READ_ONLY', fileCount: 2
    } }),
    getGitStatus: async () => ({ status: 'AVAILABLE', value: {
      branch: 'main', dirty: false, changedFiles: []
    } }),
    listProviderAccounts: async () => [],
    listSkillBindings: async () => ({ status: 'EMPTY' }),
    listMcpServers: async () => { throw new Error('offline') },
    listDiagnostics: async () => ({ status: 'EMPTY' })
  }
}

describe('Home and Project projections', () => {
  it('orders recent projects and derives active Work counts from durable state', async () => {
    const service = createProjectProjectionService({
      reads: reads(), support: support(), revision: async id => id === 'recent' ? 4 : 1
    })

    const home = await service.listHomeProjection()

    expect(home.projects.map(project => project.id)).toEqual(['recent', 'older'])
    expect(home.projects[0]).toMatchObject({ activeWorkCount: 1, revision: 4 })
    expect(home.activeWorkSessions.map(session => session.id)).toEqual(['ws-running'])
    expect(home.providerAccounts).toEqual({ status: 'EMPTY' })
  })

  it('degrades only an offline optional section and preserves Project identity', async () => {
    const service = createProjectProjectionService({
      reads: reads(), support: support(), revision: async () => 4
    })

    const detail = await service.getProjectDetail('recent')

    expect(detail.project).toMatchObject({ id: 'recent', revision: 4 })
    expect(detail.mcp).toEqual({ status: 'UNAVAILABLE', errorCode: 'MCP_OFFLINE' })
    expect(detail.workSessions).toMatchObject({ status: 'AVAILABLE' })
    expect(detail.agents).toMatchObject({ status: 'AVAILABLE' })
  })

  it('returns the same safe not-found error for missing Project identity', async () => {
    const service = createProjectProjectionService({
      reads: reads(), support: support(), revision: async () => 0
    })
    await expect(service.getProjectDetail('foreign'))
      .rejects.toMatchObject({ code: 'PROJECTION_NOT_FOUND' })
  })

  it('keeps Home available when provider health is offline', async () => {
    const offline = support()
    offline.listProviderAccounts = async () => { throw new Error('offline') }
    const service = createProjectProjectionService({
      reads: reads(), support: offline, revision: async () => 1
    })
    await expect(service.listHomeProjection()).resolves.toMatchObject({
      providerAccounts: { status: 'UNAVAILABLE', errorCode: 'PROVIDERS_OFFLINE' }
    })
  })
})
