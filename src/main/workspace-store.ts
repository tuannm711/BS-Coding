import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { canonicalProjectPath, rebaseProjectPath } from './project-path'
import type { AgentConfig, NewAgentInput, Workspace, WorkspaceSummary } from '../shared/types'
import type { JsonStore } from './json-store'

export class WorkspaceStore {
  constructor(private store: JsonStore<Workspace>) {}

  list(): WorkspaceSummary[] {
    return this.store.load().map(w => ({
      projectPath: w.projectPath,
      name: w.name,
      agentCount: w.agents.length
    }))
  }

  get(projectPath: string): Workspace | undefined {
    return this.store.load().find(w => w.projectPath === projectPath)
  }

  add(projectPath: string, name: string): Workspace {
    const all = this.store.load()
    let ws = all.find(w => w.projectPath === projectPath)
    if (!ws) {
      ws = { projectPath, name, agents: [] }
      all.push(ws)
      this.store.save(all)
    }
    return ws
  }

  remove(projectPath: string): void {
    this.store.save(this.store.load().filter(w => w.projectPath !== projectPath))
  }

  validateUpdate(projectPath: string, nextPath: string, name: string): Workspace {
    const ws = this.get(projectPath)
    if (!ws) throw new Error('Project no longer exists. Refresh the project list.')
    if (typeof name !== 'string' || !name.trim()) throw new Error('Project name is required.')
    if (typeof nextPath !== 'string' || !nextPath.trim()) throw new Error('Project folder is required.')
    const resolved = path.resolve(nextPath.trim())
    if (this.list().some(other => other.projectPath !== projectPath && canonicalProjectPath(other.projectPath) === canonicalProjectPath(resolved))) {
      throw new Error('This folder is already registered as another project.')
    }
    return { ...ws, name: name.trim(), projectPath: resolved,
      agents: ws.agents.map(agent => ({ ...agent, cwd: rebaseProjectPath(agent.cwd, projectPath, resolved) })) }
  }

  update(projectPath: string, nextPath: string, name: string): Workspace {
    const next = this.validateUpdate(projectPath, nextPath, name)
    this.store.save(this.store.load().map(ws => ws.projectPath === projectPath ? next : ws))
    return next
  }

  addAgent(projectPath: string, input: NewAgentInput): Workspace {
    const all = this.store.load()
    const ws = all.find(w => w.projectPath === projectPath)
    if (!ws) throw new Error(`Workspace not found: ${projectPath}`)
    const agent: AgentConfig = { id: randomUUID(), ...input }
    ws.agents.push(agent)
    this.store.save(all)
    return ws
  }

  removeAgent(projectPath: string, agentId: string): Workspace {
    const all = this.store.load()
    const ws = all.find(w => w.projectPath === projectPath)
    if (!ws) throw new Error(`Workspace not found: ${projectPath}`)
    ws.agents = ws.agents.filter(a => a.id !== agentId)
    this.store.save(all)
    return ws
  }

  updateAgent(projectPath: string, agentId: string, patch: Partial<AgentConfig>): Workspace {
    const all = this.store.load()
    const ws = all.find(w => w.projectPath === projectPath)
    if (!ws) throw new Error(`Workspace not found: ${projectPath}`)
    const agent = ws.agents.find(a => a.id === agentId)
    if (agent) Object.assign(agent, patch)
    this.store.save(all)
    return ws
  }
}
