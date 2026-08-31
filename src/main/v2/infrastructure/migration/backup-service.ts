import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  BackupManifestFile, MigrationDryRunReport
} from '../../../../shared/v2/contracts/migration'

async function filesUnder(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const full = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(root, full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

export class BackupService {
  constructor(private readonly deps: { now(): string } = { now: () => new Date().toISOString() }) {}

  async backup(sourcePath: string, backupRoot: string): Promise<MigrationDryRunReport> {
    const createdAt = this.deps.now()
    const name = `v1-backup-${createdAt.replace(/[:.]/g, '-')}`
    const backupPath = path.join(backupRoot, name)
    await mkdir(backupPath, { recursive: true })
    const manifestFiles: BackupManifestFile[] = []
    for (const sourceFile of await filesUnder(sourcePath)) {
      const relative = path.relative(sourcePath, sourceFile)
      const content = await readFile(sourceFile)
      const destination = path.join(backupPath, relative)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, content)
      manifestFiles.push({ path: relative.split(path.sep).join('/'),
        sha256: createHash('sha256').update(content).digest('hex'), size: (await stat(sourceFile)).size })
    }
    const manifest = { createdAt, sourceVersion: '1.3.2' as const,
      files: manifestFiles.sort((left, right) => left.path.localeCompare(right.path)) }
    await writeFile(path.join(backupPath, 'manifest.json'), JSON.stringify(manifest, null, 2))
    return { backupPath, manifest, fileCount: manifest.files.length,
      totalBytes: manifest.files.reduce((sum, file) => sum + file.size, 0) }
  }
}
