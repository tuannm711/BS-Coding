import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { BackupManifest } from '../../../../shared/v2/contracts/migration'

export interface StageInspection {
  name: string
  sourceCount: number
  targetCount: number
  archived: number
  unattributed: number
  errors: number
}

export interface ImportInspection {
  stages: readonly StageInspection[]
  samples: readonly { name: string; matched: boolean }[]
}

export interface ImportValidation {
  validated: boolean
  errors: string[]
}

const sha256 = /^[a-f0-9]{64}$/
const BackupManifestSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  sourceVersion: z.literal('1.3.2'),
  files: z.array(z.object({
    path: z.string().min(1), sha256: z.string().regex(sha256),
    size: z.number().int().nonnegative()
  }).strict())
}).strict()

export function validateBackupManifest(manifest: BackupManifest): void {
  if (!BackupManifestSchema.safeParse(manifest).success) {
    throw new Error('invalid backup manifest')
  }
  const paths = new Set<string>()
  for (const file of manifest.files) {
    if (!file.path || paths.has(file.path) || !sha256.test(file.sha256)
      || !Number.isInteger(file.size) || file.size < 0) {
      throw new Error(`invalid backup manifest entry: ${file.path || '<empty>'}`)
    }
    paths.add(file.path)
  }
}

export function fingerprintManifest(manifest: BackupManifest): string {
  validateBackupManifest(manifest)
  const files = [...manifest.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => `${file.path}\0${file.sha256}\0${file.size}`)
  return createHash('sha256')
    .update(`${manifest.sourceVersion}\0${files.join('\0')}`)
    .digest('hex')
}

export function validateImport(
  input: ImportInspection,
  requiredStages: readonly string[] = []
): ImportValidation {
  const errors: string[] = []
  const inspected = new Map<string, number>()
  for (const stage of input.stages) inspected.set(stage.name, (inspected.get(stage.name) ?? 0) + 1)
  for (const name of requiredStages) {
    const count = inspected.get(name) ?? 0
    if (count === 0) errors.push(`${name}: missing stage inspection`)
    else if (count > 1) errors.push(`${name}: duplicate stage inspection`)
  }
  for (const stage of input.stages) {
    const counts = [stage.sourceCount, stage.targetCount, stage.archived,
      stage.unattributed, stage.errors]
    if (counts.some(value => !Number.isInteger(value) || value < 0)) {
      errors.push(`${stage.name}: invalid count`)
      continue
    }
    if (stage.errors > 0) errors.push(`${stage.name}: ${stage.errors} errors`)
    const expectedTargets = stage.sourceCount - stage.archived - stage.unattributed - stage.errors
    if (expectedTargets !== stage.targetCount) {
      errors.push(`${stage.name}: expected ${expectedTargets} targets, found ${stage.targetCount}`)
    }
  }
  for (const sample of input.samples) {
    if (!sample.matched) errors.push(`${sample.name}: sample mismatch`)
  }
  return { validated: errors.length === 0, errors }
}
