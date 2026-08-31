import type { BackupManifest } from '../../../../shared/v2/contracts/migration'
import type { ImportHistoryRepository } from '../persistence/repositories'
import {
  fingerprintManifest,
  validateBackupManifest,
  validateImport,
  type ImportInspection
} from './import-validator'

export const MIGRATION_STAGE_NAMES = [
  'projects', 'providers', 'agents', 'sessions', 'usage'
] as const
export type MigrationStageName = typeof MIGRATION_STAGE_NAMES[number]

export interface MigrationStageResult {
  imported: number
  skipped: number
  errors: number
}

export interface MigrationReport {
  backupPath: string
  sourceFingerprint: string
  stages: Array<MigrationStageResult & {
    name: MigrationStageName
    status: 'COMPLETED' | 'CHECKPOINTED'
  }>
  completedStages: MigrationStageName[]
  validated: boolean
  validationErrors: string[]
}

interface MigrationRunnerDependencies {
  backup(): Promise<{ backupPath: string; manifest: BackupManifest }>
  history: ImportHistoryRepository
  stages: Record<MigrationStageName, () => Promise<MigrationStageResult>>
  inspect(): Promise<ImportInspection>
}

export function createMigrationRunner(dependencies: MigrationRunnerDependencies) {
  return {
    async run(): Promise<MigrationReport> {
      const backup = await dependencies.backup()
      if (!backup.backupPath) throw new Error('backup path is required')
      validateBackupManifest(backup.manifest)
      const sourceFingerprint = fingerprintManifest(backup.manifest)
      const stages: MigrationReport['stages'] = []
      const completedStages: MigrationStageName[] = []

      for (const name of MIGRATION_STAGE_NAMES) {
        const checkpoint = await dependencies.history.get('v1:migration-stage', name)
        if (checkpoint) {
          if (checkpoint !== sourceFingerprint) {
            throw new Error(`migration source changed after ${name} checkpoint`)
          }
          stages.push({ name, status: 'CHECKPOINTED', imported: 0, skipped: 0, errors: 0 })
          completedStages.push(name)
          continue
        }
        const result = await dependencies.stages[name]()
        if ([result.imported, result.skipped, result.errors]
          .some(value => !Number.isInteger(value) || value < 0)) {
          throw new Error(`${name} stage result contains an invalid count`)
        }
        if (result.errors > 0) throw new Error(`${name} migration reported ${result.errors} errors`)
        await dependencies.history.record('v1:migration-stage', name, sourceFingerprint)
        stages.push({ name, status: 'COMPLETED', ...result })
        completedStages.push(name)
      }

      const validation = validateImport(await dependencies.inspect(), MIGRATION_STAGE_NAMES)
      return {
        backupPath: backup.backupPath, sourceFingerprint, stages, completedStages,
        validated: validation.validated, validationErrors: validation.errors
      }
    }
  }
}
