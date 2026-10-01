import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createJsonStore } from '../../src/main/json-store'
import { WorkspaceStore } from '../../src/main/workspace-store'

let file: string
let store: WorkspaceStore

beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bs-ws-'))
  file = path.join(dir, 'workspaces.json')
  store = new WorkspaceStore(createJsonStore(file))
})

afterEach(() => rmSync(path.dirname(file), { recursive: true, force: true }))

describe('WorkspaceStore', () => {
  it('lists empty by default', () => {
    expect(store.list()).toEqual([])
  })

  it('adds a workspace without duplicating', () => {
    store.add('/proj/a', 'Project A')
    store.add('/proj/a', 'Project A again')
    expect(store.list()).toHaveLength(1)
    expect(store.get('/proj/a')?.name).toBe('Project A')
  })

  it('adds an agent and keeps its config', () => {
    store.add('/proj/a', 'Project A')
    const ws = store.addAgent('/proj/a', { name: 'op', templateId: 'opencode', cwd: '/proj/a' })
    expect(ws.agents).toHaveLength(1)
    expect(ws.agents[0].id).toBeTruthy()
    expect(ws.agents[0].templateId).toBe('opencode')
  })

  it('removes an agent by id', () => {
    store.add('/proj/a', 'Project A')
    const ws = store.addAgent('/proj/a', { name: 'op', templateId: 'opencode', cwd: '/proj/a' })
    const agentId = ws.agents[0].id
    const after = store.removeAgent('/proj/a', agentId)
    expect(after.agents).toHaveLength(0)
  })

  it('throws when adding an agent to an unknown workspace', () => {
    expect(() => store.addAgent('/nope', { name: 'x', templateId: 't', cwd: '/nope' }))
      .toThrow('Workspace not found')
  })

  it('removes a workspace', () => {
    store.add('/proj/a', 'Project A')
    store.remove('/proj/a')
    expect(store.list()).toHaveLength(0)
  })

  it('updates an agent mode', () => {
    store.add('/proj/a', 'Project A')
    const ws = store.addAgent('/proj/a', { name: 'bs', templateId: 'bs', cwd: '/proj/a', kind: 'native' })
    const agentId = ws.agents[0].id
    store.updateAgent('/proj/a', agentId, { mode: 'plan' })
    expect(store.get('/proj/a')?.agents[0].mode).toBe('plan')
  })

  it('edits a project and rebases agent folders while retaining IDs and external folders', () => {
    const oldPath = path.resolve('/proj/a')
    const newPath = path.resolve('/proj/moved')
    store.add(oldPath, 'Before')
    store.addAgent(oldPath, { name: 'root', templateId: 'bs', cwd: oldPath, kind: 'native' })
    store.addAgent(oldPath, { name: 'nested', templateId: 'opencode', cwd: path.join(oldPath, 'packages', 'web') })
    const before = store.addAgent(oldPath, { name: 'external', templateId: 'aider', cwd: path.resolve('/other') })
    const result = store.update(oldPath, newPath, ' After ')
    expect(result.name).toBe('After')
    expect(result.agents.map(agent => agent.id)).toEqual(before.agents.map(agent => agent.id))
    expect(result.agents.map(agent => agent.cwd)).toEqual([newPath, path.join(newPath, 'packages', 'web'), path.resolve('/other')])
    expect(store.get(oldPath)).toBeUndefined()
    expect(store.get(newPath)).toEqual(result)
  })

  it('rejects a duplicate folder or empty name without changing projects', () => {
    const a = path.resolve('/proj/a')
    const b = path.resolve('/proj/b')
    store.add(a, 'A')
    store.add(b, 'B')
    const before = store.list()
    expect(() => store.update(a, path.join(b, '.'), 'Changed')).toThrow(/already/i)
    expect(() => store.update(a, a, '  ')).toThrow(/name/i)
    expect(store.list()).toEqual(before)
  })
})
