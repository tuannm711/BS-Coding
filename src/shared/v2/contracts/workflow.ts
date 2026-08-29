export interface PlanTaskDefinition {
  id: string
  dependsOn: readonly string[]
  acceptanceCriteria: readonly string[]
  informational?: boolean
}

export interface TaskGraph {
  tasks: readonly PlanTaskDefinition[]
}

export interface SchedulableTask {
  id: string
  status: 'QUEUED' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'CANCELLED'
  dependsOn: readonly string[]
}
