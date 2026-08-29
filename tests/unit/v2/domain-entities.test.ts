import { describe, expect, it } from 'vitest'
import { correlationOf } from '../../../src/main/v2/domain/entities'
import type {
  AgentDefinition,
  AgentRun,
  AgentVersion,
  Artifact,
  ExecutionCorrelation,
  Finding,
  Project,
  Review,
  RuntimeEpoch,
  Task,
  TaskRun,
  WorkflowRun,
  WorkSession
} from '../../../src/shared/v2/contracts/domain'

describe('execution correlation', () => {
  it('preserves the full Project to RuntimeEpoch chain as a snapshot', () => {
    const input: ExecutionCorrelation = {
      projectId: 'p',
      workSessionId: 'w',
      workflowRunId: 'r',
      taskRunId: 'tr',
      agentRunId: 'ar',
      runtimeEpochId: 'e'
    }

    const correlation = correlationOf(input)

    expect(correlation).toEqual(input)
    expect(correlation).not.toBe(input)
  })
})

describe('domain entity contracts', () => {
  it('forms a JSON-serializable ownership chain', () => {
    const project: Project = {
      id: 'p',
      name: 'BS Coding',
      repoPath: 'C:/repo',
      defaultBranch: 'master',
      instructionsRef: 'AGENTS.md',
      createdAt: '2026-08-29T00:00:00.000Z',
      updatedAt: '2026-08-29T00:00:00.000Z'
    }
    const workSession: WorkSession = {
      id: 'w', projectId: project.id, title: 'P02', goal: 'Domain', status: 'EXECUTING',
      activeWorkflowRunId: 'r', createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const workflowRun: WorkflowRun = {
      id: 'r', workSessionId: workSession.id, status: 'EXECUTING', blockingGates: 0,
      createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const task: Task = {
      id: 't', workflowRunId: workflowRun.id, title: 'Define contracts', dependsOn: [],
      createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const taskRun: TaskRun = {
      id: 'tr', taskId: task.id, workflowRunId: workflowRun.id, attempt: 1, status: 'RUNNING',
      createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const agentDefinition: AgentDefinition = {
      id: 'ad', projectId: project.id, name: 'Backend Developer', role: 'WORKER',
      createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const agentVersion: AgentVersion = {
      id: 'av', agentDefinitionId: agentDefinition.id, revision: 1,
      systemInstructions: 'Implement P02', toolIds: ['read'], skillIds: [],
      permissionProfile: { read: 'allow' }, createdAt: project.createdAt
    }
    const agentRun: AgentRun = {
      id: 'ar', taskRunId: taskRun.id, agentVersionId: agentVersion.id, status: 'RUNNING',
      createdAt: project.createdAt, updatedAt: project.updatedAt
    }
    const runtimeEpoch: RuntimeEpoch = {
      id: 'e', agentRunId: agentRun.id, status: 'ACTIVE', reason: 'INITIAL',
      startedAt: project.createdAt
    }
    const review: Review = {
      id: 'rv', workflowRunId: workflowRun.id, reviewerAgentVersionId: agentVersion.id,
      scope: 'P02', createdAt: project.createdAt
    }
    const finding: Finding = {
      id: 'f', reviewId: review.id, severity: 'HIGH', status: 'OPEN', evidenceRefs: ['a'],
      createdAt: project.createdAt
    }
    const artifact: Artifact = {
      id: 'a', projectId: project.id, kind: 'REPORT', uri: 'artifact://p02',
      createdAt: project.createdAt
    }

    const entities = [project, workSession, workflowRun, task, taskRun, agentDefinition,
      agentVersion, agentRun, runtimeEpoch, review, finding, artifact]

    expect(JSON.parse(JSON.stringify(entities))).toHaveLength(12)
    expect(runtimeEpoch.agentRunId).toBe(agentRun.id)
  })
})
