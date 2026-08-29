import type { PlanTaskDefinition, SchedulableTask } from '../../../../shared/v2/contracts/workflow'

export function validateGraph(tasks: readonly PlanTaskDefinition[]): true {
  const ids = new Set<string>()
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`duplicate task id ${task.id}`)
    ids.add(task.id)
    if (!task.informational && task.acceptanceCriteria.length === 0) {
      throw new Error(`task ${task.id} requires acceptance criteria`)
    }
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`missing dependency ${dependency}`)
    }
  }
  const byId = new Map(tasks.map(task => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`dependency cycle at ${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
  return true
}

export function runnableTaskIds(tasks: readonly SchedulableTask[]): string[] {
  const byId = new Map(tasks.map(task => [task.id, task]))
  return tasks
    .filter(task => task.status === 'QUEUED' && task.dependsOn.every(id => byId.get(id)?.status === 'COMPLETED'))
    .map(task => task.id)
}
