import type BetterSqlite3 from 'better-sqlite3'
import type {
  AgentDefinition,
  AgentRun,
  AgentVersion,
  Finding,
  Project,
  Review,
  RuntimeEpoch,
  Task,
  TaskRun,
  WorkflowRun,
  WorkSession
} from '../../../../shared/v2/contracts/domain'
import type { ArtifactRef, ArtifactStore } from '../../application/ports/artifact-store'

interface Entity {
  id: string
}

export interface Repository<T extends Entity> {
  get(id: string): Promise<T | null>
  save(value: T): Promise<void>
}

interface PayloadRow {
  payload_json: string
}

function createJsonRepository<T extends Entity>(
  db: BetterSqlite3.Database,
  table: string,
  ownerValues: (value: T) => Record<string, string>
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
        'SELECT * FROM artifacts WHERE project_id = ? ORDER BY id'
      ).all(projectId) as Array<Record<string, unknown>>
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
  runtimeEpochs: Repository<RuntimeEpoch>
  reviews: Repository<Review>
  findings: Repository<Finding>
  artifacts: ArtifactStore
}

export function createRepositories(db: BetterSqlite3.Database): V2Repositories {
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
    runtimeEpochs: createJsonRepository(db, 'runtime_epochs', value => ({
      agent_run_id: value.agentRunId
    })),
    reviews: createJsonRepository(db, 'reviews', value => ({
      workflow_run_id: value.workflowRunId
    })),
    findings: createJsonRepository(db, 'findings', value => ({
      review_id: value.reviewId
    })),
    artifacts: createArtifactRepository(db)
  }
}
