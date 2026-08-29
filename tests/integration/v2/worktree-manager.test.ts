import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { WorktreeManager } from '../../../src/main/v2/infrastructure/git/worktree-manager'

const roots: string[] = []

function createRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v2-worktree-'))
  roots.push(root)
  execFileSync('git', ['init', '-b', 'main'], { cwd: root })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root })
  writeFileSync(path.join(root, 'README.md'), 'base')
  execFileSync('git', ['add', 'README.md'], { cwd: root })
  execFileSync('git', ['commit', '-m', 'base'], { cwd: root })
  return { root, head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('WorktreeManager', () => {
  it('creates independent writable worktrees and deterministic branches', async () => {
    const repo = createRepo()
    const manager = new WorktreeManager(repo.root)
    const a = await manager.createTaskWorkspace({ workflowId: 'wf', taskId: 'A',
      taskRunId: 'tr-a', attempt: 1, baseCommit: repo.head })
    const b = await manager.createTaskWorkspace({ workflowId: 'wf', taskId: 'B',
      taskRunId: 'tr-b', attempt: 1, baseCommit: repo.head })
    expect(a.path).not.toBe(b.path)
    expect(a.branch).toBe('bs/v2/wf/A/1')
    expect(b.branch).toBe('bs/v2/wf/B/1')
    writeFileSync(path.join(a.path, 'only-a.txt'), 'a')
    expect(() => execFileSync('git', ['status', '--porcelain'], { cwd: b.path })).not.toThrow()
  })

  it('refuses to remove a dirty unmerged workspace', async () => {
    const repo = createRepo()
    const manager = new WorktreeManager(repo.root)
    const workspace = await manager.createTaskWorkspace({ workflowId: 'wf', taskId: 'A',
      taskRunId: 'tr-a', attempt: 1, baseCommit: repo.head })
    writeFileSync(path.join(workspace.path, 'uncommitted.txt'), 'keep')
    await expect(manager.remove(workspace.id)).rejects.toThrow(/uncommitted|unmerged/i)
  })
})
