import type { AgentAssignmentSnapshot } from '../../shared/provider-state'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
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
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`
      writeFileSync(temp, JSON.stringify(value, null, 2))
      renameSync(temp, file)
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

  migrate(settings: { agents?: Record<string, { provider?: string; model?: string; accountId?: string; speed?: 'standard' | 'fast' }> }, workspaceAgents: Array<{ id: string; name: string; model?: string; accountId?: string; speed?: 'standard' | 'fast' }>): { migrated: number; needsReview: string[] } {
    let migrated = 0
    const needsReview: string[] = []
    for (const agent of workspaceAgents) {
      if (this.state.assignments[agent.id]) continue
      const profile = settings.agents?.[agent.name]
      const encoded = profile?.model ?? agent.model ?? ''
      const slash = encoded.indexOf('/')
      const providerId = profile?.provider ?? (slash > 0 ? encoded.slice(0, slash) : '')
      const modelId = slash > 0 ? encoded.slice(slash + 1) : encoded
      const status = providerId && modelId ? 'ready' as const : 'needs-review' as const
      this.state.assignments[agent.id] = { agentId: agent.id, providerId, modelId, accountId: profile?.accountId ?? agent.accountId, speed: profile?.speed ?? agent.speed ?? 'standard', revision: 1, status }
      migrated++
      if (status === 'needs-review') needsReview.push(agent.id)
    }
    if (migrated > 0) this.persistence.save(this.state)
    return { migrated, needsReview }
  }

  private read(): AssignmentFile {
    const raw = this.persistence.load() as Partial<AssignmentFile> | null
    if (!raw || raw.version !== 1 || !raw.assignments || typeof raw.assignments !== 'object') return { version: 1, assignments: {} }
    return { version: 1, assignments: raw.assignments }
  }
}
