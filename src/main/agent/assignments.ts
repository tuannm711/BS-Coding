import type { AgentAssignmentSnapshot } from '../../shared/provider-state'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface AssignmentPersistence {
  load(): unknown
  save(value: unknown): void
}

export function fileAssignmentPersistence(file: string): AssignmentPersistence {
  return {
    load() {
      if (!existsSync(file)) return null
      try { return JSON.parse(readFileSync(file, 'utf-8')) } catch { return null }
    },
    save(value) {
      mkdirSync(path.dirname(file), { recursive: true })
      writeFileSync(file, JSON.stringify(value, null, 2))
    }
  }
}

interface AssignmentFile {
  version: 1
  assignments: Record<string, AgentAssignmentSnapshot>
}

export class AssignmentStore {
  private state: AssignmentFile

  constructor(private readonly persistence: AssignmentPersistence) {
    this.state = this.read()
  }

  load(): Record<string, AgentAssignmentSnapshot> {
    return { ...this.state.assignments }
  }

  get(agentId: string): AgentAssignmentSnapshot | undefined {
    return this.state.assignments[agentId]
  }

  set(input: Omit<AgentAssignmentSnapshot, 'revision'> & { revision?: number }): AgentAssignmentSnapshot {
    const current = this.state.assignments[input.agentId]
    const next: AgentAssignmentSnapshot = {
      ...input,
      revision: Math.max(current?.revision ?? 0, input.revision ?? 0) + 1
    }
    this.state.assignments[input.agentId] = next
    this.persistence.save(this.state)
    return next
  }

  remove(agentId: string): void {
    delete this.state.assignments[agentId]
    this.persistence.save(this.state)
  }

  private read(): AssignmentFile {
    const raw = this.persistence.load() as Partial<AssignmentFile> | null
    if (!raw || raw.version !== 1 || !raw.assignments || typeof raw.assignments !== 'object') return { version: 1, assignments: {} }
    return { version: 1, assignments: raw.assignments }
  }
}
