import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { BackupService } from '../../../src/main/v2/infrastructure/migration/backup-service'

it('copies V1 files and writes a SHA-256 manifest before import', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'bs-v1-backup-test-'))
  const source = path.join(root, 'source'); const backups = path.join(root, 'backups')
  try {
    const { mkdirSync } = await import('node:fs'); mkdirSync(source)
    writeFileSync(path.join(source, 'sessions.json'), '[]')
    writeFileSync(path.join(source, 'workspaces.json'), '[{"name":"PMS"}]')
    const service = new BackupService({ now: () => '2026-08-31T01:02:03.000Z' })
    const report = await service.backup(source, backups)
    expect(report.manifest.files).toHaveLength(2)
    expect(report.manifest.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(JSON.parse(readFileSync(path.join(report.backupPath, 'manifest.json'), 'utf8')))
      .toEqual(report.manifest)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
