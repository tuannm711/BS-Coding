import { describe, expect, it } from 'vitest'
import { WorkflowEngine } from '../../../src/main/v2/application/workflow/workflow-engine'

const plan = {
  workflowRunId: 'run', approved: true as const,
  tasks: [
    { id: 'A', dependsOn: [], acceptanceCriteria: ['A done'] },
    { id: 'B', dependsOn: ['A'], acceptanceCriteria: ['B done'] },
    { id: 'C', dependsOn: ['B'], acceptanceCriteria: ['C done'] }
  ]
}

describe('WorkflowEngine', () => {
  it('creates execution state only from an approved valid plan', () => {
    const engine = new WorkflowEngine()
    expect(() => engine.createFromApprovedPlan({ ...plan, approved: false as true })).toThrow(/approved/i)
    expect(engine.createFromApprovedPlan(plan).tasks.map(task => task.status))
      .toEqual(['QUEUED', 'QUEUED', 'QUEUED'])
  })

  it('dispatches only tasks whose dependencies completed', () => {
    const engine = new WorkflowEngine()
    const initial = engine.createFromApprovedPlan(plan)
    const afterA = engine.acceptTaskOutcome(initial, { taskId: 'A', outcome: 'SUCCEEDED' })
    expect(engine.dispatchReady(afterA).map(task => task.id)).toEqual(['B'])
  })

  it('maps agent outcomes through the engine without mutating prior state', () => {
    const engine = new WorkflowEngine()
    const initial = engine.createFromApprovedPlan(plan)
    const failed = engine.acceptTaskOutcome(initial, { taskId: 'A', outcome: 'FAILED' })
    expect(failed.tasks[0].status).toBe('FAILED')
    expect(initial.tasks[0].status).toBe('QUEUED')
    expect(() => engine.acceptTaskOutcome(initial, { taskId: 'missing', outcome: 'SUCCEEDED' }))
      .toThrow(/unknown task/i)
  })
})
