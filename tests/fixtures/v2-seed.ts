import Database from 'better-sqlite3'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Project, WorkflowRun, WorkSession } from '../../src/shared/v2/contracts/domain'

const timestamp = '2026-08-30T00:00:00.000Z'

function migrations(): Array<{ version: number; sql: string }> {
  const root = path.join(process.cwd(), 'src', 'main', 'v2', 'infrastructure', 'persistence', 'migrations')
  const files = ['001-core.sql', '002-events.sql', '003-projections-idempotency.sql',
    '004-usage.sql', '005-budget-cost-known.sql', '006-provider-accounts.sql']
  return files.map((file, index) => ({ version: index + 1,
    sql: readFileSync(path.join(root, file), 'utf8') }))
}

export function seedV2Backend(userData: string, projectPath: string) {
  const stateDir = path.join(userData, 'v2')
  mkdirSync(stateDir, { recursive: true })
  const connectionsDir = path.join(userData, 'connections')
  mkdirSync(connectionsDir, { recursive: true })
  writeFileSync(path.join(connectionsDir, 'accounts.json'), JSON.stringify({ version: 1,
    connections: [{ providerId: 'openai', activeAccountId: 'account-ui', accounts: [{
      id: 'account-ui', providerId: 'openai', label: 'UI test account', authMode: 'api-key',
      status: 'active', createdAt: 1, lastUsedAt: 1, models: ['model-ui'],
      modelCatalog: [{ id: 'model-ui', name: 'UI Model', capabilities: { supportsTools: true } }],
      usage: { accountId: 'account-ui', refreshedAt: Date.parse(timestamp), source: 'provider',
        status: 'ok', primaryUsedPercent: 25 }
    }] }] }, null, 2))
  const db = new Database(path.join(stateDir, 'state.sqlite'))
  const ids = { projectId: 'project-pms', workSessionId: 'work-p15', workflowRunId: 'workflow-p15',
    taskId: 'task-implementation', taskRunId: 'task-run-1', agentDefinitionId: 'agent-worker',
    agentVersionId: 'agent-version-1', agentRunId: 'agent-run-1', findingId: 'finding-1' }
  try {
    db.pragma('foreign_keys = ON')
    db.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`)
    for (const migration of migrations()) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
        .run(migration.version, timestamp)
    }
    const project: Project = { id: ids.projectId, name: 'PMS', repoPath: projectPath,
      defaultBranch: 'master', instructionsRef: 'AGENTS.md', createdAt: timestamp, updatedAt: timestamp }
    const session: WorkSession = { id: ids.workSessionId, projectId: ids.projectId,
      title: 'P15 backend', goal: 'Prove durable projections', status: 'EXECUTING',
      activeWorkflowRunId: ids.workflowRunId, createdAt: timestamp, updatedAt: timestamp }
    const workflow: WorkflowRun = { id: ids.workflowRunId, workSessionId: ids.workSessionId,
      status: 'EXECUTING', blockingGates: 0, createdAt: timestamp, updatedAt: timestamp }
    db.prepare('INSERT INTO projects(id, payload_json) VALUES (?, ?)')
      .run(project.id, JSON.stringify(project))
    db.prepare('INSERT INTO work_sessions(id, project_id, payload_json) VALUES (?, ?, ?)')
      .run(session.id, session.projectId, JSON.stringify(session))
    db.prepare('INSERT INTO workflow_runs(id, work_session_id, payload_json) VALUES (?, ?, ?)')
      .run(workflow.id, workflow.workSessionId, JSON.stringify(workflow))
    db.prepare('INSERT INTO tasks(id, workflow_run_id, payload_json) VALUES (?, ?, ?)').run(
      ids.taskId, ids.workflowRunId, JSON.stringify({ id: ids.taskId,
        workflowRunId: ids.workflowRunId, title: 'Implement backend', dependsOn: [],
        createdAt: timestamp, updatedAt: timestamp }))
    db.prepare(`INSERT INTO task_runs(id, task_id, workflow_run_id, payload_json)
      VALUES (?, ?, ?, ?)`).run(ids.taskRunId, ids.taskId, ids.workflowRunId, JSON.stringify({
      id: ids.taskRunId, taskId: ids.taskId, workflowRunId: ids.workflowRunId,
      attempt: 1, status: 'RUNNING', createdAt: timestamp, updatedAt: timestamp }))
    db.prepare(`INSERT INTO agent_definitions(id, project_id, payload_json)
      VALUES (?, ?, ?)`).run(ids.agentDefinitionId, ids.projectId, JSON.stringify({
      id: ids.agentDefinitionId, projectId: ids.projectId, name: 'Worker', role: 'WORKER',
      currentVersionId: ids.agentVersionId, createdAt: timestamp, updatedAt: timestamp }))
    db.prepare(`INSERT INTO agent_versions(id, agent_definition_id, payload_json)
      VALUES (?, ?, ?)`).run(ids.agentVersionId, ids.agentDefinitionId, JSON.stringify({
      id: ids.agentVersionId, agentDefinitionId: ids.agentDefinitionId, revision: 1,
      systemInstructions: 'Implement', toolIds: [], skillIds: [], permissionProfile: {}, createdAt: timestamp }))
    db.prepare(`INSERT INTO agent_runs(id, task_run_id, agent_version_id, payload_json)
      VALUES (?, ?, ?, ?)`).run(ids.agentRunId, ids.taskRunId, ids.agentVersionId, JSON.stringify({
      id: ids.agentRunId, taskRunId: ids.taskRunId, agentVersionId: ids.agentVersionId,
      status: 'RUNNING', createdAt: timestamp, updatedAt: timestamp }))
    db.prepare(`INSERT INTO runtime_epochs(id, agent_run_id, payload_json)
      VALUES (?, ?, ?)`).run('epoch-1', ids.agentRunId, JSON.stringify({ id: 'epoch-1',
      agentRunId: ids.agentRunId, workSessionId: ids.workSessionId, reason: 'INITIAL',
      status: 'ACTIVE', providerId: 'openai', accountId: 'account-old', modelId: 'model-old',
      startedAt: timestamp }))
    db.prepare(`INSERT INTO reviews(id, workflow_run_id, payload_json)
      VALUES (?, ?, ?)`).run('review-1', ids.workflowRunId, JSON.stringify({ id: 'review-1',
      workflowRunId: ids.workflowRunId, reviewerAgentVersionId: ids.agentVersionId,
      scope: ['Task 7'], decision: 'FAIL', findingIds: [ids.findingId], createdAt: timestamp }))
    db.prepare(`INSERT INTO findings(id, review_id, payload_json)
      VALUES (?, ?, ?)`).run(ids.findingId, 'review-1', JSON.stringify({ id: ids.findingId,
      reviewId: 'review-1', severity: 'HIGH', blocking: true, category: 'correctness',
      description: 'Needs rework', evidenceRefs: ['artifact-1'], affectedFiles: ['src/a.ts'],
      reviewerAgentVersionId: ids.agentVersionId, status: 'OPEN' }))
    const usagePayload = { id: 'usage-seed', projectId: ids.projectId,
      workSessionId: ids.workSessionId, workflowRunId: ids.workflowRunId,
      providerId: 'openai', accountId: 'account-ui', modelId: 'model-ui', requests: 1,
      inputTokens: 10, outputTokens: 2, occurredAt: timestamp }
    db.prepare(`INSERT INTO usage_records(id, project_id, work_session_id, workflow_run_id,
      task_run_id, agent_run_id, provider_id, account_id, requests, input_tokens, output_tokens,
      cache_read_tokens, cache_write_tokens, cost_usd, occurred_at, payload_json, cost_known)
      VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, 0)`)
      .run(usagePayload.id, usagePayload.projectId, usagePayload.workSessionId,
        usagePayload.workflowRunId, usagePayload.providerId, usagePayload.accountId,
        usagePayload.requests, usagePayload.inputTokens, usagePayload.outputTokens,
        usagePayload.occurredAt, JSON.stringify(usagePayload))
    return ids
  } finally {
    db.close()
  }
}
