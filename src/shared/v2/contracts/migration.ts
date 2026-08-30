export interface BackupManifestFile {
  path: string
  sha256: string
  size: number
}

export interface BackupManifest {
  createdAt: string
  sourceVersion: '1.3.2'
  files: readonly BackupManifestFile[]
}

export interface MigrationDryRunReport {
  backupPath: string
  manifest: BackupManifest
  fileCount: number
  totalBytes: number
}
