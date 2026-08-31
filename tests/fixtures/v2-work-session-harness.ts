import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { WorkflowEngine } from '../../src/main/v2/application/workflow/workflow-engine'
import { createReviewService } from '../../src/main/v2/application/review/review-service'
import { createReworkService } from '../../src/main/v2/application/review/rework-service'
import { canFinalize } from '../../src/main/v2/application/review/final-verifier'
import { transitionWorkflow, type WorkflowEvent } from '../../src/main/v2/domain/workflow/workflow-state'
import { WorktreeManager } from '../../src/main/v2/infrastructure/git/worktree-manager'
import { openV2Database } from '../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../src/main/v2/infrastructure/persistence/migration-runner'
import { createRepositories } from '../../src/main/v2/infrastructure/persistence/repositories'
import { SqliteUnitOfWork } from '../../src/main/v2/infrastructure/persistence/sqlite-unit-of-work'
import type { WorkflowRun, WorkSession } from '../../src/shared/v2/contracts/domain'
import type { QualityGate, ReviewFinding, ReviewRecord } from '../../src/shared/v2/contracts/review'

const PROJECT_ID = 'project-oauth'
const WORK_SESSION_ID = 'work-oauth'
const WORKFLOW_ID = 'workflow-oauth'

export class TestV2Harness {
  private readonly events: string[] = []
  private readonly workspacePaths: string[] = []
  private readonly baseCommits: string[] = []
  private idSequence = 0
  private clockSequence = 0
  private disposed = false

  private constructor(
    private readonly root: string,
    private readonly repoPath: string,
    private readonly db: ReturnType<typeof openV2Database>,
    private readonly repositories: ReturnType<typeof createRepositories>,
    private readonly transaction: SqliteUnitOfWork,
    private readonly worktrees: WorktreeManager,
    private readonly baseCommit: string
  ) {}

  static async create(): Promise<TestV2Harness> {
    const root = mkdtempSync(path.join(tmpdir(), 'bs-v2-lifecycle-'))
    const repoPath = path.join(root, 'repo')
    mkdirSync(repoPath)
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.name', 'V2 Test'], { cwd: repoPath })
    writeFileSync(path.join(repoPath, 'README.md'), 'V2 lifecycle\n')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'fixture baseline'], { cwd: repoPath })
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath, encoding: 'utf8'
    }).trim()
    const db = openV2Database(path.join(root, 'state.sqlite'))
    migrate(db)
    return new TestV2Harness(root, repoPath, db, createRepositories(db),
      new SqliteUnitOfWork(db), new WorktreeManager(repoPath), baseCommit)
  }

  async startOAuthScenario(): Promise<string> {
    const createdAt = this.now()
    await this.repositories.projects.save({ id: PROJECT_ID, name: 'OAuth app', repoPath: this.repoPath,
      defaultBranch: 'main', instructionsRef: 'AGENTS.md', createdAt, updatedAt: createdAt })
    const workSession: WorkSession = { id: WORK_SESSION_ID, projectId: PROJECT_ID,
      title: 'Implement OAuth', goal: 'Implement OAuth safely', status: 'PLANNING',
      activeWorkflowRunId: WORKFLOW_ID, createdAt, updatedAt: createdAt }
    const workflow: WorkflowRun = { id: WORKFLOW_ID, workSessionId: WORK_SESSION_ID,
      status: 'RECEIVED', blockingGates: 0, createdAt, updatedAt: createdAt }
    await this.repositories.workSessions.save(workSession)
    await this.repositories.workflowRuns.save(workflow)
    await this.repositories.agentDefinitions.save({ id: 'agent-worker', projectId: PROJECT_ID,
      name: 'Worker', role: 'WORKER', currentVersionId: 'agent-worker-v1',
      createdAt, updatedAt: createdAt })
    await this.repositories.agentVersions.save({ id: 'agent-worker-v1',
      agentDefinitionId: 'agent-worker', revision: 1, systemInstructions: 'Implement safely',
      toolIds: [], skillIds: [], permissionProfile: {}, createdAt })

    await this.advance(['ANALYZE', 'PLAN', 'REQUEST_APPROVAL', 'APPROVE'])
    const engine = new WorkflowEngine()
    let execution = engine.createFromApprovedPlan({ workflowRunId: WORKFLOW_ID, approved: true,
      tasks: [{ id: 'implement-auth', dependsOn: [], acceptanceCriteria: ['OAuth implementation exists'] },
        { id: 'test-auth', dependsOn: ['implement-auth'], acceptanceCriteria: ['OAuth tests pass'] }] })
    for (const task of execution.tasks) await this.repositories.tasks.save({ id: task.id,
      workflowRunId: WORKFLOW_ID, title: task.id, dependsOn: [...task.dependsOn],
      createdAt: this.now(), updatedAt: this.now() })
    this.events.push('plan:approved')

    const first = engine.dispatchReady(execution)
    if (first.length !== 1 || first[0].id !== 'implement-auth') throw new Error('unexpected first task')
    await this.runTask('implement-auth', true)
    execution = engine.acceptTaskOutcome(execution, { taskId: 'implement-auth', outcome: 'SUCCEEDED' })
    const second = engine.dispatchReady(execution)
    if (second.length !== 1 || second[0].id !== 'test-auth') throw new Error('dependency was not released')
    await this.runTask('test-auth', false)
    execution = engine.acceptTaskOutcome(execution, { taskId: 'test-auth', outcome: 'SUCCEEDED' })
    if (engine.dispatchReady(execution).length !== 0) throw new Error('completed plan still has ready tasks')
    await this.advance(['INTEGRATE', 'REVIEW'])
    return WORK_SESSION_ID
  }

  async failSecurityReview(workSessionId: string, description: string): Promise<void> {
    this.assertSession(workSessionId)
    const ids = ['review-failed', 'finding-security']
    const service = createReviewService({
      nextId: () => ids.shift() ?? this.nextId(), now: () => this.now(),
      saveReview: review => this.repositories.reviews.save(review),
      saveFinding: finding => this.repositories.findings.save(finding),
      transaction: operation => this.transaction.run(operation)
    })
    const result = await service.ingest({ workflowRunId: WORKFLOW_ID,
      reviewerAgentVersionId: 'agent-worker-v1', scope: ['src/auth.ts'], decision: 'FAIL',
      findings: [{ severity: 'HIGH', blocking: true, category: 'security', description,
        evidenceRefs: ['review-log'], affectedFiles: ['src/auth.ts'], status: 'OPEN' }] })
    if (!result.blocked) throw new Error('failed security review was not blocking')
    const run = await this.requiredWorkflow()
    await this.saveWorkflow({ ...transitionWorkflow({ ...run, blockingGates: 1 },
      { type: 'REQUEST_REWORK' }), blockingGates: 1 })
    this.events.push('review:failed')
  }

  async reportWorkerSuccess(workSessionId: string): Promise<void> {
    this.assertSession(workSessionId)
    const finding = await this.repositories.findings.get('finding-security')
    const review = await this.repositories.reviews.get('review-failed')
    const allowed = canFinalize({ gates: [{ blocking: true, status: 'FAIL' }],
      findings: finding ? [finding] : [], reviews: review ? [review] : [] })
    if (allowed) throw new Error('worker success bypassed review gates')
    this.events.push('worker:success-rejected')
  }

  async completeReworkAndRerunGates(workSessionId: string): Promise<void> {
    this.assertSession(workSessionId)
    const failedFinding = await this.repositories.findings.get('finding-security')
    if (!failedFinding) throw new Error('security finding is missing')
    const passedGate: QualityGate = { id: 'gate-rerun', scope: 'security', kind: 'MECHANICAL',
      blocking: true, status: 'PASS', artifactRefs: ['gate-log'] }
    const passedReview: ReviewRecord = { id: 'review-rerun', workflowRunId: WORKFLOW_ID,
      reviewerAgentVersionId: 'agent-worker-v1', scope: ['src/auth.ts'], decision: 'PASS',
      findingIds: [failedFinding.id], createdAt: this.now() }
    const fixedFinding: ReviewFinding = { ...failedFinding, status: 'FIXED',
      linkedReworkTaskId: 'rework-security' }
    const service = createReworkService({
      nextId: () => 'rework-security', now: () => this.now(),
      transaction: operation => this.transaction.run(operation),
      saveReworkTask: async task => {
        await this.repositories.tasks.save({ id: task.id, workflowRunId: task.workflowRunId,
          title: task.title, dependsOn: [], createdAt: task.createdAt, updatedAt: task.createdAt })
        this.events.push('rework:persisted')
      },
      linkFinding: async (findingId, taskId) => {
        const finding = await this.repositories.findings.get(findingId)
        if (!finding) throw new Error('rework finding is missing')
        await this.repositories.findings.save({ ...finding, linkedReworkTaskId: taskId })
      },
      dispatchAndAwaitWorker: async task => {
        await this.commitIsolatedWorktree(task.id, 'oauth-state.txt', 'validated')
        this.events.push('rework:worker-completed')
      },
      rerunRequiredGates: async () => { this.events.push('gates:rerun-pass'); return [passedGate] },
      rerunFailedReviews: async () => {
        await this.repositories.reviews.save(passedReview)
        await this.repositories.findings.save(fixedFinding)
        this.events.push('review:rerun-pass')
        return { reviews: [passedReview], findings: [fixedFinding] }
      },
      completeWorkflow: async () => {
        const run = await this.requiredWorkflow()
        const verifying = transitionWorkflow({ ...run, blockingGates: 0 }, { type: 'VERIFY' })
        await this.saveWorkflow({ ...transitionWorkflow(verifying, { type: 'COMPLETE' }), blockingGates: 0 })
        this.events.push('workflow:completed')
      }
    })
    const result = await service.rework({ workflowRunId: WORKFLOW_ID,
      findingIds: [failedFinding.id], title: 'Fix OAuth state validation' })
    if (!result.completed) throw new Error('verified rework did not complete')
  }

  async status(workSessionId: string): Promise<WorkSession['status']> {
    const session = await this.repositories.workSessions.get(workSessionId)
    if (!session) throw new Error('unknown Work Session')
    return session.status
  }

  trace(): string[] { return [...this.events] }

  gitEvidence(): { repoIsGit: boolean; isolatedWorktreeCount: number; committedWorktreeCount: number } {
    const repoIsGit = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: this.repoPath, encoding: 'utf8'
    }).trim() === 'true'
    const committedWorktreeCount = this.workspacePaths.filter((workspacePath, index) =>
      Number(execFileSync('git', ['rev-list', '--count', `${this.baseCommits[index]}..HEAD`], {
        cwd: workspacePath, encoding: 'utf8'
      }).trim()) > 0).length
    return { repoIsGit, isolatedWorktreeCount: this.workspacePaths.length, committedWorktreeCount }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.db.close()
    rmSync(this.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }

  private async runTask(taskId: string, writes: boolean): Promise<void> {
    const now = this.now()
    const taskRunId = `task-run-${taskId}`
    const agentRunId = `agent-run-${taskId}`
    await this.repositories.taskRuns.save({ id: taskRunId, taskId, workflowRunId: WORKFLOW_ID,
      attempt: 1, status: 'RUNNING', createdAt: now, updatedAt: now })
    await this.repositories.agentRuns.save({ id: agentRunId, taskRunId,
      agentVersionId: 'agent-worker-v1', status: 'RUNNING', createdAt: now, updatedAt: now })
    if (writes) await this.commitIsolatedWorktree(taskId, 'auth.ts', 'export const oauth = true\n')
    const completedAt = this.now()
    await this.repositories.taskRuns.save({ id: taskRunId, taskId, workflowRunId: WORKFLOW_ID,
      attempt: 1, status: 'COMPLETED', createdAt: now, updatedAt: completedAt, completedAt })
    await this.repositories.agentRuns.save({ id: agentRunId, taskRunId,
      agentVersionId: 'agent-worker-v1', status: 'SUCCEEDED', createdAt: now,
      updatedAt: completedAt, completedAt })
    this.events.push(`task:${taskId}`)
  }

  private async commitIsolatedWorktree(taskId: string, file: string, content: string): Promise<void> {
    const workspace = await this.worktrees.createTaskWorkspace({ workflowId: WORKFLOW_ID,
      taskId, taskRunId: `task-run-${taskId}`, attempt: 1, baseCommit: this.baseCommit })
    writeFileSync(path.join(workspace.path, file), content)
    execFileSync('git', ['add', file], { cwd: workspace.path })
    execFileSync('git', ['commit', '-m', taskId], { cwd: workspace.path })
    this.workspacePaths.push(workspace.path)
    this.baseCommits.push(workspace.baseCommit)
  }

  private async advance(events: WorkflowEvent['type'][]): Promise<void> {
    let run = await this.requiredWorkflow()
    for (const type of events) run = { ...run, ...transitionWorkflow(run, { type } as WorkflowEvent) }
    await this.saveWorkflow(run)
  }

  private async saveWorkflow(state: Pick<WorkflowRun, 'status' | 'blockingGates' | 'pausedFrom'>): Promise<void> {
    const current = await this.requiredWorkflow()
    const updatedAt = this.now()
    const run: WorkflowRun = { ...current, status: state.status, blockingGates: state.blockingGates,
      ...(state.pausedFrom ? { pausedFrom: state.pausedFrom } : {}), updatedAt,
      ...(state.status === 'COMPLETED' ? { completedAt: updatedAt } : {}) }
    await this.repositories.workflowRuns.save(run)
    const session = await this.repositories.workSessions.get(WORK_SESSION_ID)
    if (!session) throw new Error('Work Session is missing')
    const status: WorkSession['status'] = run.status === 'REWORKING' ? 'REWORK'
      : run.status === 'REVIEWING' ? 'REVIEW' : run.status === 'VERIFYING' ? 'VERIFYING'
        : run.status === 'COMPLETED' ? 'COMPLETED' : run.status === 'EXECUTING'
          || run.status === 'INTEGRATING' ? 'EXECUTING' : 'PLANNING'
    await this.repositories.workSessions.save({ ...session, status, updatedAt,
      ...(status === 'COMPLETED' ? { completedAt: updatedAt } : {}) })
  }

  private async requiredWorkflow(): Promise<WorkflowRun> {
    const run = await this.repositories.workflowRuns.get(WORKFLOW_ID)
    if (!run) throw new Error('WorkflowRun is missing')
    return run
  }

  private assertSession(id: string): void {
    if (id !== WORK_SESSION_ID) throw new Error('unknown Work Session')
  }

  private nextId(): string { this.idSequence += 1; return `id-${this.idSequence}` }
  private now(): string {
    const value = new Date(Date.UTC(2026, 8, 1, 0, 0, this.clockSequence)).toISOString()
    this.clockSequence += 1
    return value
  }
}
