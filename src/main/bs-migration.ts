import { copyFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BS_USER_DATA_ENV = 'BS_USER_DATA'
export const LEGACY_USER_DATA_ENV = 'MEOW_USER_DATA'
export const BS_MIGRATION_VERSION = 1

export interface MigrationResult {
  userDataDir: string
  sourceDir: string | null
  migrated: boolean
  markerPath: string
}

interface MigrationOptions {
  legacyDir?: string
  env?: NodeJS.ProcessEnv
}

export function resolveUserDataDir(env: NodeJS.ProcessEnv, defaultDir: string): string {
  return env[BS_USER_DATA_ENV] ?? env[LEGACY_USER_DATA_ENV] ?? defaultDir
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function copyMerge(source: string, target: string): Promise<boolean> {
  const sourceStat = await stat(source)
  if (sourceStat.isDirectory()) {
    await mkdir(target, { recursive: true })
    let changed = false
    for (const entry of await readdir(source)) {
      changed = (await copyMerge(path.join(source, entry), path.join(target, entry))) || changed
    }
    return changed
  }
  if (await exists(target)) return false
  await mkdir(path.dirname(target), { recursive: true })
  await copyFile(source, target)
  return true
}

function renameAgent(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  const next = { ...record }
  if (next.id === 'meow') next.id = 'bs'
  if (next.name === 'meow') next.name = 'bs'
  if (next.command === 'meow') next.command = 'bs'
  if (next.templateId === 'meow') next.templateId = 'bs'
  if (Array.isArray(next.agents)) {
    next.agents = next.agents.map(renameAgent)
  } else if (next.agents && typeof next.agents === 'object') {
    const agents = { ...(next.agents as Record<string, unknown>) }
    if (agents.meow !== undefined && agents.bs === undefined) {
      agents.bs = renameAgent(agents.meow)
      delete agents.meow
    }
    next.agents = agents
  }
  return next
}

function transformJson(fileName: string, value: unknown): unknown {
  if (fileName === 'templates.json' && Array.isArray(value)) return value.map(renameAgent)
  if (fileName === 'workspaces.json' && Array.isArray(value)) return value.map(renameAgent)
  if (fileName === 'meow.json') return renameAgent(value)
  return value
}

async function migrateJson(source: string, target: string, sourceName: string): Promise<boolean> {
  if (await exists(target)) return false
  const parsed = JSON.parse(await readFile(source, 'utf8')) as unknown
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(transformJson(sourceName, parsed), null, 2) + '\n', 'utf8')
  return true
}

export async function migrateLegacyUserData(
  canonicalDir: string,
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const markerPath = path.join(canonicalDir, 'bs-migration.json')
  if (await exists(markerPath)) {
    return { userDataDir: canonicalDir, sourceDir: null, migrated: false, markerPath }
  }
  await mkdir(canonicalDir, { recursive: true })
  const sourceDir = options.legacyDir && await exists(options.legacyDir) ? options.legacyDir : null
  if (!sourceDir) return { userDataDir: canonicalDir, sourceDir: null, migrated: false, markerPath }

  let changed = false
  for (const entry of await readdir(sourceDir)) {
    if (entry === 'meow.json' || entry === 'templates.json' || entry === 'workspaces.json') continue
    changed = (await copyMerge(path.join(sourceDir, entry), path.join(canonicalDir, entry))) || changed
  }
  changed = (await migrateJson(path.join(sourceDir, 'meow.json'), path.join(canonicalDir, 'bs.json'), 'meow.json').catch(err => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  })) || changed
  for (const fileName of ['templates.json', 'workspaces.json']) {
    changed = (await migrateJson(path.join(sourceDir, fileName), path.join(canonicalDir, fileName), fileName).catch(err => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw err
    })) || changed
  }
  changed = true

  await writeFile(markerPath + '.tmp', JSON.stringify({ version: BS_MIGRATION_VERSION, migratedAt: new Date().toISOString() }) + '\n', 'utf8')
  await rename(markerPath + '.tmp', markerPath)
  return { userDataDir: canonicalDir, sourceDir, migrated: changed, markerPath }
}
