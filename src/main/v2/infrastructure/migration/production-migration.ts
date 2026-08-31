import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { BackupService } from './backup-service'
import { importProjects } from './import-projects'
import { importProviders } from './import-providers'
import { importAgents } from './import-agents'
import { importSessions } from './import-sessions'
import { importHistoricalUsage, type HistoricalUsageImportResult } from './import-usage'
import { createMigrationRunner, type MigrationReport } from './migration-runner'
import { openV2Database } from '../persistence/database'
import { migrate } from '../persistence/migration-runner'
import { createRepositories } from '../persistence/repositories'
import { SqliteEventStore } from '../persistence/sqlite-event-store'
import { UsageLedger } from '../../application/observability/usage-ledger'
import { createUsageRepository } from '../persistence/usage-repository'
import { MigrationReportSchema } from '../../../../shared/v2/schemas/migration'

const workspaceSchema = z.object({ projectPath: z.string().min(1), name: z.string().min(1),
  agents: z.array(z.object({ id: z.string().min(1), name: z.string().min(1),
    templateId: z.string().min(1), cwd: z.string().min(1), kind: z.enum(['pty', 'native']).optional(),
    mode: z.enum(['build', 'plan', 'coordinate']).optional() }).passthrough()) }).passthrough()
const accountsSchema = z.object({ version: z.literal(1), connections: z.array(z.object({
  providerId: z.string().min(1), accounts: z.array(z.unknown())
}).passthrough()) }).passthrough()
const sourceFiles = ['workspaces.json', 'sessions.json', 'connections/accounts.json',
  'connections/vault.json'] as const

async function json(file: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

async function snapshotSources(userDataPath: string): Promise<string> {
  const snapshot = await mkdtemp(path.join(tmpdir(), 'bs-v1-source-'))
  for (const relative of sourceFiles) {
    const source = path.join(userDataPath, relative)
    try {
      const destination = path.join(snapshot, relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(source, destination)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return snapshot
}

function countUsage(sessions: readonly unknown[], accounts: readonly unknown[]) {
  let attributable = 0
  let unattributed = 0
  for (const raw of sessions) {
    const session = raw as { usage?: { input?: number; output?: number; cacheRead?: number;
      cacheWrite?: number; cost?: number }; items?: unknown[] }
    const observed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    for (const item of session.items ?? []) {
      const message = item as { kind?: string; message?: { role?: string; tokens?: { input?: number;
        output?: number; cacheRead?: number; cacheWrite?: number }; execution?: {
        providerId?: string; accountId?: string } } }
      if (message.kind !== 'message' || message.message?.role !== 'assistant'
        || !message.message.tokens) continue
      observed.input += message.message.tokens.input ?? 0
      observed.output += message.message.tokens.output ?? 0
      observed.cacheRead += message.message.tokens.cacheRead ?? 0
      observed.cacheWrite += message.message.tokens.cacheWrite ?? 0
      if (message.message.execution?.providerId && message.message.execution.accountId) attributable += 1
      else unattributed += 1
    }
    if ((session.usage?.cost ?? 0) > 0) unattributed += 1
    if (session.usage && (session.usage.input !== observed.input
      || session.usage.output !== observed.output || session.usage.cacheRead !== observed.cacheRead
      || session.usage.cacheWrite !== observed.cacheWrite)) unattributed += 1
  }
  const quota = accounts.filter(account => Boolean((account as { usage?: unknown }).usage)).length
  return { attributable, quota, unattributed }
}

export async function runProductionV1Migration(input: {
  userDataPath: string
  databasePath: string
  backupRoot: string
}): Promise<MigrationReport> {
  await mkdir(path.dirname(input.databasePath), { recursive: true })
  const db = openV2Database(input.databasePath)
  let snapshot: string | undefined
  try {
    migrate(db)
    const existing = db.prepare("SELECT report_json FROM cutover_state WHERE id = 'global'")
      .get() as { report_json: string } | undefined
    if (existing) {
      const report = MigrationReportSchema.parse(JSON.parse(existing.report_json)) as MigrationReport
      if (!report.validated || report.validationErrors.length > 0) {
        throw new Error('persisted V2 migration report is not valid')
      }
      return report
    }

    snapshot = await snapshotSources(input.userDataPath)
    const workspaces = z.array(workspaceSchema).parse(await json(path.join(snapshot, 'workspaces.json'), []))
    const sessions = z.array(z.unknown()).parse(await json(path.join(snapshot, 'sessions.json'), []))
    const storedAccounts = accountsSchema.parse(await json(path.join(snapshot,
      'connections', 'accounts.json'), { version: 1, connections: [] }))
    const accounts = storedAccounts.connections.flatMap(connection => connection.accounts)
    const repositories = createRepositories(db)
    const events = new SqliteEventStore(db)
    const usage = new UsageLedger(createUsageRepository(db))
    let sessionResult = { imported: 0, skipped: 0, archived: 0, importedIds: [] as string[],
      archivedLegacyIds: [] as string[] }
    let usageResult: HistoricalUsageImportResult = { importedUsage: 0, importedQuota: 0,
      skipped: 0, unattributed: 0 }
    const countHistory = (type: string) => (db.prepare(
      'SELECT COUNT(*) count FROM import_history WHERE source_type = ?').get(type) as { count: number }).count
    const runner = createMigrationRunner({
      backup: async () => {
        const report = await new BackupService().backup(snapshot!, input.backupRoot)
        return { backupPath: report.backupPath, manifest: report.manifest }
      },
      history: repositories.importHistory,
      stages: {
        projects: async () => { const result = await importProjects(workspaces.map(workspace => ({
          legacyId: workspace.projectPath, path: workspace.projectPath, name: workspace.name
        })), repositories); return { imported: result.imported, skipped: result.skipped, errors: 0 } },
        providers: async () => { const result = await importProviders(accounts.map(account => {
          const item = account as Record<string, unknown>
          return { ...item, legacyId: item.id }
        }), repositories); return { imported: result.imported, skipped: result.skipped, errors: 0 } },
        agents: async () => {
          const values = []
          for (const workspace of workspaces) {
            const projectId = await repositories.importHistory.get('v1:project', workspace.projectPath)
            if (!projectId) throw new Error(`project import is missing for ${workspace.projectPath}`)
            values.push(...workspace.agents.map(agent => ({ ...agent, legacyId: agent.id, projectId })))
          }
          const result = await importAgents(values, repositories)
          return { imported: result.imported, skipped: result.skipped, errors: 0 }
        },
        sessions: async () => { sessionResult = await importSessions(sessions, { repositories, events })
          return { imported: sessionResult.imported, skipped: sessionResult.skipped, errors: 0 } },
        usage: async () => { usageResult = await importHistoricalUsage({ sessions,
          providerAccounts: accounts }, { repositories, usage })
          return { imported: usageResult.importedUsage + usageResult.importedQuota,
            skipped: usageResult.skipped, errors: 0 } }
      },
      inspect: async () => {
        const usageCounts = countUsage(sessions, accounts)
        const firstProject = workspaces[0]
        const importedProjectId = firstProject
          ? await repositories.importHistory.get('v1:project', firstProject.projectPath) : null
        const importedProject = importedProjectId ? await repositories.projects.get(importedProjectId) : null
        return { stages: [
          { name: 'projects', sourceCount: workspaces.length, targetCount: countHistory('v1:project'), archived: 0, unattributed: 0, errors: 0 },
          { name: 'providers', sourceCount: accounts.length, targetCount: countHistory('v1:provider-account'), archived: 0, unattributed: 0, errors: 0 },
          { name: 'agents', sourceCount: workspaces.reduce((sum, item) => sum + item.agents.length, 0), targetCount: countHistory('v1:agent'), archived: 0, unattributed: 0, errors: 0 },
          { name: 'sessions', sourceCount: sessions.length, targetCount: countHistory('v1:session'), archived: countHistory('v1:session-archive'), unattributed: 0, errors: 0 },
          { name: 'usage', sourceCount: usageCounts.attributable + usageCounts.quota + usageCounts.unattributed,
            targetCount: countHistory('v1:usage') + countHistory('v1:quota'), archived: 0,
            unattributed: usageCounts.unattributed, errors: 0 }
        ], samples: firstProject ? [{ name: `project:${firstProject.projectPath}`,
          matched: importedProject?.repoPath === firstProject.projectPath }] : [] }
      }
    })
    const report = await runner.run()
    if (!report.validated) throw new Error(`V1 migration validation failed: ${report.validationErrors.join('; ')}`)
    const persisted = MigrationReportSchema.parse(report)
    db.prepare(`INSERT INTO cutover_state(id, report_json, completed_at) VALUES ('global', ?, ?)`)
      .run(JSON.stringify(persisted), new Date().toISOString())
    return report
  } finally {
    db.close()
    if (snapshot) await rm(snapshot, { recursive: true, force: true })
  }
}
