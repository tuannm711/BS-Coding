import type BetterSqlite3 from 'better-sqlite3'
import type {
  AgentDefinition,
  AgentRun,
  AgentVersion,
  Project,
  Task,
  TaskRun,
  WorkflowRun,
  WorkSession
} from '../../../../shared/v2/contracts/domain'
import type { ArtifactRef, ArtifactStore } from '../../application/ports/artifact-store'
import type { CommandIdempotencyPort } from '../../application/ports/command-idempotency-port'
import type { ProjectionReadPort } from '../../application/ports/projection-read-port'
import type { ReviewFinding, ReviewRecord } from '../../../../shared/v2/contracts/review'
import type { RuntimeEpochSummary } from '../../../../shared/v2/contracts/ui-projections'
import { z } from 'zod'
import { WorkSessionSchema, WorkflowRunSchema } from '../../../../shared/v2/schemas/ipc'
import { FindingSchema, ReviewSchema } from '../../../../shared/v2/schemas/review'
import { RuntimeEpochSummarySchema } from '../../../../shared/v2/schemas/ui-projections'

interface Entity {
  id: string
}

export interface Repository<T extends Entity> {
  get(id: string): Promise<T | null>
  save(value: T): Promise<void>
}

export interface ProviderAccountRecord extends Entity {
  providerId: string
  label: string
  authMode: 'api-key' | 'oauth' | 'imported'
  status: 'HEALTHY' | 'EXPIRED' | 'ERROR' | 'UNKNOWN'
  enabled: boolean
  vaultRef?: string
  createdAt: string
  lastUsedAt: string
  updatedAt: string
}

export interface ImportHistoryRepository {
  get(sourceType: string, sourceKey: string): Promise<string | null>
  record(sourceType: string, sourceKey: string, importedId: string): Promise<void>
}

interface PayloadRow {
  payload_json: string
}

function payload<T>(row: PayloadRow, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(row.payload_json))
}

function listPayloads<T>(db: BetterSqlite3.Database, schema: z.ZodType<T>, sql: string,
  ...params: readonly unknown[]): T[] {
  return (db.prepare(sql).all(...params) as PayloadRow[]).map(row => payload(row, schema))
}

const timestamp = z.iso.datetime({ offset: true })
const id = z.string().min(1)
const ProjectSchema: z.ZodType<Project> = z.object({
  id, name: id, repoPath: id, defaultBranch: id, instructionsRef: id,
  createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp.optional()
}).strict()
const TaskSchema: z.ZodType<Task> = z.object({
  id, workflowRunId: id, title: z.string(), dependsOn: z.array(id),
  createdAt: timestamp, updatedAt: timestamp
}).strict()
const TaskRunSchema: z.ZodType<TaskRun> = z.object({
  id, taskId: id, workflowRunId: id, attempt: z.number().int().positive(),
  status: z.enum(['QUEUED', 'READY', 'RUNNING', 'WAITING_APPROVAL', 'BLOCKED', 'FAILED',
    'CANCELLED', 'REVIEW_FAILED', 'REWORK', 'COMPLETED']),
  provenanceTaskRunId: id.optional(), createdAt: timestamp, updatedAt: timestamp,
  completedAt: timestamp.optional()
}).strict()
const AgentDefinitionSchema: z.ZodType<AgentDefinition> = z.object({
  id, projectId: id, name: id, role: id, currentVersionId: id.optional(),
  createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp.optional()
}).strict()
const AgentRunSchema: z.ZodType<AgentRun> = z.object({
  id, taskRunId: id, agentVersionId: id,
  status: z.enum(['CREATED', 'STARTING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED',
    'CANCELLED', 'DEGRADED']), createdAt: timestamp, updatedAt: timestamp,
  completedAt: timestamp.optional()
}).strict()

export interface PersistedRuntimeEpoch extends RuntimeEpochSummary {
  agentRunId: string
  workSessionId: string
  reason: string
  endReason?: string
}

export const PROJECTION_LIST_LIMIT = 1000

export interface RuntimeEpochRepository extends Repository<PersistedRuntimeEpoch> {
  findActiveByAgentRun(agentRunId: string): Promise<PersistedRuntimeEpoch | null>
}

const PersistedRuntimeEpochSchema: z.ZodType<PersistedRuntimeEpoch> = RuntimeEpochSummarySchema.extend({
  agentRunId: id, workSessionId: id, reason: id, endReason: id.optional()
}).strict()

function createJsonRepository<T extends Entity>(
  db: BetterSqlite3.Database,
  table: string,
  ownerValues: (value: T) => Record<string, string | null>
): Repository<T> {
  return {
    async get(id) {
      const row = db.prepare(`SELECT payload_json FROM ${table} WHERE id = ?`).get(id) as
        | PayloadRow
        | undefined
      return row ? JSON.parse(row.payload_json) as T : null
    },
    async save(value) {
      const owners = ownerValues(value)
      const ownerColumns = Object.keys(owners)
      const columns = ['id', ...ownerColumns, 'payload_json']
      const updates = columns.slice(1).map(column => `${column} = excluded.${column}`)
      const placeholders = columns.map(() => '?').join(', ')
      db.prepare(`
        INSERT INTO ${table}(${columns.join(', ')}) VALUES (${placeholders})
        ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}
      `).run(value.id, ...Object.values(owners), JSON.stringify(value))
    }
  }
}

function createArtifactRepository(db: BetterSqlite3.Database): ArtifactStore {
  const fromRow = (row: Record<string, unknown>): ArtifactRef => ({
    id: row.id as string,
    projectId: row.project_id as string,
    kind: row.kind as string,
    path: row.path as string,
    size: row.size as number,
    ...(row.sha256 === null ? {} : { sha256: row.sha256 as string })
  })

  return {
    async get(id) {
      const row = db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
        | Record<string, unknown>
        | undefined
      return row ? fromRow(row) : null
    },
    async save(artifact) {
      db.prepare(`
        INSERT INTO artifacts(id, project_id, kind, path, size, sha256)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          kind = excluded.kind,
          path = excluded.path,
          size = excluded.size,
          sha256 = excluded.sha256
      `).run(
        artifact.id,
        artifact.projectId,
        artifact.kind,
        artifact.path,
        artifact.size,
        artifact.sha256 ?? null
      )
    },
    async listByProject(projectId) {
      const rows = db.prepare(
        'SELECT * FROM artifacts WHERE project_id = ? ORDER BY id LIMIT ?'
      ).all(projectId, PROJECTION_LIST_LIMIT) as Array<Record<string, unknown>>
      return rows.map(fromRow)
    }
  }
}

export interface V2Repositories {
  projects: Repository<Project>
  workSessions: Repository<WorkSession>
  workflowRuns: Repository<WorkflowRun>
  tasks: Repository<Task>
  taskRuns: Repository<TaskRun>
  agentDefinitions: Repository<AgentDefinition>
  agentVersions: Repository<AgentVersion>
  agentRuns: Repository<AgentRun>
  providerAccounts: Repository<ProviderAccountRecord>
  importHistory: ImportHistoryRepository
  runtimeEpochs: RuntimeEpochRepository
  reviews: Repository<ReviewRecord>
  findings: Repository<ReviewFinding>
  artifacts: ArtifactStore
  projections: ProjectionReadPort
  commandIdempotency: CommandIdempotencyPort
}

function createProjectionReads(db: BetterSqlite3.Database,
  artifacts: ArtifactStore): ProjectionReadPort {
  return {
    async getProject(id) {
      const row = db.prepare('SELECT payload_json FROM projects WHERE id = ?').get(id) as PayloadRow | undefined
      return row ? payload(row, ProjectSchema) : null
    },
    async listProjects() {
      return listPayloads(db, ProjectSchema, `SELECT payload_json FROM projects
        ORDER BY json_extract(payload_json, '$.updatedAt') DESC, id ASC LIMIT ?`, PROJECTION_LIST_LIMIT)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    },
    async getWorkSessionOwnedByProject(projectId, workSessionId) {
      const row = db.prepare(`SELECT payload_json FROM work_sessions
        WHERE id = ? AND project_id = ?`).get(workSessionId, projectId) as PayloadRow | undefined
      return row ? payload(row, WorkSessionSchema) : null
    },
    async listWorkSessionsByProject(projectId) {
      return listPayloads(db, WorkSessionSchema,
        `SELECT payload_json FROM work_sessions WHERE project_id = ?
          ORDER BY json_extract(payload_json, '$.updatedAt') DESC, id ASC LIMIT ?`,
        projectId, PROJECTION_LIST_LIMIT)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    },
    async getWorkflowOwnedByProject(projectId, workflowRunId) {
      const row = db.prepare(`SELECT wr.payload_json FROM workflow_runs wr
        JOIN work_sessions ws ON ws.id = wr.work_session_id
        WHERE wr.id = ? AND ws.project_id = ?`).get(workflowRunId, projectId) as PayloadRow | undefined
      return row ? payload(row, WorkflowRunSchema) : null
    },
    async listTasksByWorkflow(workflowRunId) {
      return listPayloads(db, TaskSchema,
        'SELECT payload_json FROM tasks WHERE workflow_run_id = ? ORDER BY id LIMIT ?',
        workflowRunId, PROJECTION_LIST_LIMIT)
    },
    async listTaskRunsByWorkflow(workflowRunId) {
      return listPayloads(db, TaskRunSchema,
        'SELECT payload_json FROM task_runs WHERE workflow_run_id = ? ORDER BY id LIMIT ?',
        workflowRunId, PROJECTION_LIST_LIMIT)
    },
    async listAgentDefinitionsByProject(projectId) {
      return listPayloads(db, AgentDefinitionSchema,
        'SELECT payload_json FROM agent_definitions WHERE project_id = ? ORDER BY id LIMIT ?',
        projectId, PROJECTION_LIST_LIMIT)
    },
    async listAgentRunsByWorkflow(workflowRunId) {
      return listPayloads(db, AgentRunSchema, `SELECT ar.payload_json FROM agent_runs ar
        JOIN task_runs tr ON tr.id = ar.task_run_id
        WHERE tr.workflow_run_id = ? ORDER BY ar.id LIMIT ?`, workflowRunId, PROJECTION_LIST_LIMIT)
    },
    async listRuntimeEpochsByWorkflow(workflowRunId) {
      return listPayloads(db, PersistedRuntimeEpochSchema, `SELECT re.payload_json FROM runtime_epochs re
        JOIN agent_runs ar ON ar.id = re.agent_run_id
        JOIN task_runs tr ON tr.id = ar.task_run_id
        WHERE tr.workflow_run_id = ? ORDER BY re.id LIMIT ?`, workflowRunId,
      PROJECTION_LIST_LIMIT).map(epoch => ({
          id: epoch.id, status: epoch.status, providerId: epoch.providerId,
          accountId: epoch.accountId, modelId: epoch.modelId, startedAt: epoch.startedAt,
          ...(epoch.endedAt ? { endedAt: epoch.endedAt } : {})
        }))
    },
    async listReviewsByWorkflow(workflowRunId) {
      return listPayloads(db, ReviewSchema as z.ZodType<ReviewRecord>,
        'SELECT payload_json FROM reviews WHERE workflow_run_id = ? ORDER BY id LIMIT ?',
        workflowRunId, PROJECTION_LIST_LIMIT)
    },
    async listFindingsByWorkflow(workflowRunId) {
      return listPayloads(db, FindingSchema as z.ZodType<ReviewFinding>, `SELECT f.payload_json FROM findings f
        JOIN reviews r ON r.id = f.review_id
        WHERE r.workflow_run_id = ? ORDER BY f.id LIMIT ?`, workflowRunId, PROJECTION_LIST_LIMIT)
    },
    async listArtifactsByProject(projectId) { return artifacts.listByProject(projectId) }
  }
}

function json(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('command result must be JSON-serializable')
  return serialized
}

function createCommandIdempotency(db: BetterSqlite3.Database): CommandIdempotencyPort {
  return {
    async reserve(requestId, commandName) {
      const row = db.prepare(`SELECT status, result_json FROM command_idempotency
        WHERE request_id = ? AND command_name = ?`).get(requestId, commandName) as
        | { status: 'IN_PROGRESS' | 'COMPLETED'; result_json: string | null }
        | undefined
      if (row?.status === 'COMPLETED') {
        return { status: 'COMPLETED', result: JSON.parse(row.result_json!) }
      }
      if (row) return { status: 'IN_PROGRESS' }
      db.prepare(`INSERT INTO command_idempotency(
        request_id, command_name, status, result_json, created_at
      ) VALUES (?, ?, 'IN_PROGRESS', NULL, ?)`)
        .run(requestId, commandName, new Date().toISOString())
      return { status: 'RESERVED' }
    },
    async complete(requestId, commandName, result) {
      const changed = db.prepare(`UPDATE command_idempotency
        SET status = 'COMPLETED', result_json = ?, completed_at = ?
        WHERE request_id = ? AND command_name = ? AND status = 'IN_PROGRESS'`)
        .run(json(result), new Date().toISOString(), requestId, commandName)
      if (changed.changes !== 1) throw new Error('command reservation is not in progress')
    },
    async release(requestId, commandName) {
      db.prepare(`DELETE FROM command_idempotency
        WHERE request_id = ? AND command_name = ? AND status = 'IN_PROGRESS'`)
        .run(requestId, commandName)
    }
  }
}

function createImportHistory(db: BetterSqlite3.Database): ImportHistoryRepository {
  const get = async (sourceType: string, sourceKey: string): Promise<string | null> => {
    const row = db.prepare(`SELECT imported_id FROM import_history
      WHERE source_type = ? AND source_key = ?`).get(sourceType, sourceKey) as
      | { imported_id: string }
      | undefined
    return row?.imported_id ?? null
  }
  return {
    get,
    async record(sourceType, sourceKey, importedId) {
      db.prepare(`INSERT INTO import_history(source_type, source_key, imported_id, imported_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(source_type, source_key) DO NOTHING`)
        .run(sourceType, sourceKey, importedId, new Date().toISOString())
      const recorded = await get(sourceType, sourceKey)
      if (recorded !== importedId) throw new Error('legacy source key maps to a different entity')
    }
  }
}

export function createRepositories(db: BetterSqlite3.Database): V2Repositories {
  const artifacts = createArtifactRepository(db)
  const runtimeEpochBase = createJsonRepository<PersistedRuntimeEpoch>(db, 'runtime_epochs', value => ({
    agent_run_id: value.agentRunId
  }))
  const runtimeEpochs: RuntimeEpochRepository = { ...runtimeEpochBase,
    async findActiveByAgentRun(agentRunId) {
      const row = db.prepare(`SELECT payload_json FROM runtime_epochs
        WHERE agent_run_id = ? AND json_extract(payload_json, '$.status') = 'ACTIVE'
        ORDER BY id DESC LIMIT 1`).all(agentRunId) as PayloadRow[]
      return row.map(item => payload(item, PersistedRuntimeEpochSchema))
        .find(epoch => epoch.status === 'ACTIVE') ?? null
    } }
  return {
    projects: createJsonRepository(db, 'projects', () => ({})),
    workSessions: createJsonRepository(db, 'work_sessions', value => ({
      project_id: value.projectId
    })),
    workflowRuns: createJsonRepository(db, 'workflow_runs', value => ({
      work_session_id: value.workSessionId
    })),
    tasks: createJsonRepository(db, 'tasks', value => ({
      workflow_run_id: value.workflowRunId
    })),
    taskRuns: createJsonRepository(db, 'task_runs', value => ({
      task_id: value.taskId,
      workflow_run_id: value.workflowRunId
    })),
    agentDefinitions: createJsonRepository(db, 'agent_definitions', value => ({
      project_id: value.projectId
    })),
    agentVersions: createJsonRepository(db, 'agent_versions', value => ({
      agent_definition_id: value.agentDefinitionId
    })),
    agentRuns: createJsonRepository(db, 'agent_runs', value => ({
      task_run_id: value.taskRunId,
      agent_version_id: value.agentVersionId
    })),
    providerAccounts: createJsonRepository(db, 'provider_accounts', value => ({
      provider_id: value.providerId,
      vault_ref: value.vaultRef ?? null
    })),
    importHistory: createImportHistory(db),
    runtimeEpochs,
    reviews: createJsonRepository(db, 'reviews', value => ({
      workflow_run_id: value.workflowRunId
    })),
    findings: createJsonRepository(db, 'findings', value => ({
      review_id: value.reviewId
    })),
    artifacts,
    projections: createProjectionReads(db, artifacts),
    commandIdempotency: createCommandIdempotency(db)
  }
}
