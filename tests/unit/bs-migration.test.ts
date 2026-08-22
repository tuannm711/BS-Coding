import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateLegacyUserData, resolveUserDataDir } from '../../src/main/bs-migration'

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'bs-migration-'))
}

describe('resolveUserDataDir', () => {
  it('prefers BS_USER_DATA over the legacy variable and default', () => {
    expect(resolveUserDataDir({ BS_USER_DATA: 'bs', MEOW_USER_DATA: 'legacy' }, 'default')).toBe('bs')
  })

  it('accepts the legacy environment variable as a migration fallback', () => {
    expect(resolveUserDataDir({ MEOW_USER_DATA: 'legacy' }, 'default')).toBe('legacy')
  })
})

describe('migrateLegacyUserData', () => {
  it('does nothing for a fresh profile', async () => {
    const canonical = await tempDir()
    const result = await migrateLegacyUserData(canonical, { legacyDir: path.join(canonical, 'missing') })
    expect(result.migrated).toBe(false)
    expect(result.sourceDir).toBeNull()
  })

  it('merges and transforms a legacy profile without changing arbitrary text', async () => {
    const root = await tempDir()
    const legacy = path.join(root, 'legacy')
    const canonical = path.join(root, 'canonical')
    await mkdir(legacy, { recursive: true })
    await writeFile(path.join(legacy, 'meow.json'), JSON.stringify({
      agents: { meow: { systemPrompt: 'Keep meow in user text' } },
      arbitrary: 'meow must remain here'
    }))
    await writeFile(path.join(legacy, 'templates.json'), JSON.stringify([
      { id: 'meow', name: 'meow', command: 'meow', args: [], kind: 'native' }
    ]))
    await writeFile(path.join(legacy, 'workspaces.json'), JSON.stringify([
      { projectPath: '/project', name: 'Project', agents: [{ id: 'a1', name: 'meow', templateId: 'meow', cwd: '/project', kind: 'native' }] }
    ]))
    const result = await migrateLegacyUserData(canonical, { legacyDir: legacy })
    expect(result.migrated).toBe(true)
    const config = JSON.parse(await readFile(path.join(canonical, 'bs.json'), 'utf8'))
    expect(config.agents.bs.systemPrompt).toBe('Keep meow in user text')
    expect(config.arbitrary).toBe('meow must remain here')
    const templates = JSON.parse(await readFile(path.join(canonical, 'templates.json'), 'utf8'))
    expect(templates[0]).toMatchObject({ id: 'bs', name: 'bs', command: 'bs' })
    const workspaces = JSON.parse(await readFile(path.join(canonical, 'workspaces.json'), 'utf8'))
    expect(workspaces[0].agents[0]).toMatchObject({ name: 'bs', templateId: 'bs' })
    expect(await readFile(path.join(legacy, 'meow.json'), 'utf8')).toContain('meow')
  })

  it('does not overwrite existing BS files and can retry after partial migration', async () => {
    const root = await tempDir()
    const legacy = path.join(root, 'legacy')
    const canonical = path.join(root, 'canonical')
    await mkdir(legacy, { recursive: true })
    await mkdir(canonical, { recursive: true })
    await writeFile(path.join(legacy, 'templates.json'), '[{"id":"meow"}]')
    await writeFile(path.join(canonical, 'templates.json'), '[{"id":"bs","name":"new"}]')
    const result = await migrateLegacyUserData(canonical, { legacyDir: legacy })
    expect(result.migrated).toBe(true)
    expect(await readFile(path.join(canonical, 'templates.json'), 'utf8')).toContain('new')
    const second = await migrateLegacyUserData(canonical, { legacyDir: legacy })
    expect(second.migrated).toBe(false)
  })

  it('preserves invalid legacy JSON and does not write a success marker', async () => {
    const root = await tempDir()
    const legacy = path.join(root, 'legacy')
    const canonical = path.join(root, 'canonical')
    await mkdir(legacy, { recursive: true })
    await writeFile(path.join(legacy, 'meow.json'), '{invalid')
    await expect(migrateLegacyUserData(canonical, { legacyDir: legacy })).rejects.toThrow()
    await expect(readFile(path.join(canonical, 'bs-migration.json'))).rejects.toThrow()
    expect(await readFile(path.join(legacy, 'meow.json'), 'utf8')).toBe('{invalid')
  })
})
