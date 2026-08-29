import type { PlanTaskDefinition, SchedulableTask } from '../../../../shared/v2/contracts/workflow'

export interface GraphValidationContext {
  eligibleCapabilities: ReadonlySet<string>
  resolvableWorkspaceKeys: ReadonlySet<string>
  validQualityGateScopes: ReadonlySet<string>
}

export function validateGraph(
  tasks: readonly PlanTaskDefinition[],
  context?: GraphValidationContext
): true {
  const ids = new Set<string>()
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`duplicate task id ${task.id}`)
    ids.add(task.id)
    if (!task.informational && task.acceptanceCriteria.length === 0) {
      throw new Error(`task ${task.id} requires acceptance criteria`)
    }
    if (context && task.requiredCapability && !context.eligibleCapabilities.has(task.requiredCapability)) {
      throw new Error(`task ${task.id} has unsatisfied capability ${task.requiredCapability}`)
    }
    if (context && task.workspaceKey && !context.resolvableWorkspaceKeys.has(task.workspaceKey)) {
      throw new Error(`task ${task.id} has unresolved workspace ${task.workspaceKey}`)
    }
    if (context) {
      for (const scope of task.qualityGateScopes ?? []) {
        if (!context.validQualityGateScopes.has(scope)) {
          throw new Error(`task ${task.id} references invalid quality gate scope ${scope}`)
        }
      }
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
