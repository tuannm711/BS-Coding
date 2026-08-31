import { expect, it } from 'vitest'
import { V1ProviderAccountAdapter } from '../../../src/main/v2/infrastructure/providers/v1-provider-account-adapter'
import { V1WorkspaceGitAdapter } from '../../../src/main/v2/infrastructure/workspace/v1-workspace-git-adapter'
import { V1SettingsVaultAdapter } from '../../../src/main/v2/infrastructure/settings/v1-settings-vault-adapter'

it('maps workspace and Git state without exposing V1 handles', async () => {
  const adapter = new V1WorkspaceGitAdapter({
    resolveProjectPath: async id => id === 'p1' ? 'C:/PMS' : null,
    getWorkspace: path => path === 'C:/PMS' ? { projectPath: path, agentCount: 2 } : null,
    getGitStatus: async () => ({ branch: 'main', dirtyCount: 3 })
  })

  await expect(adapter.getWorkspace('p1')).resolves.toEqual({ status: 'AVAILABLE', value: {
    id: 'workspace-p1', path: 'C:/PMS', mode: 'READ_ONLY', fileCount: 0
  } })
  await expect(adapter.getGitStatus('p1')).resolves.toEqual({ status: 'AVAILABLE', value: {
    branch: 'main', dirty: true, changedFiles: []
  } })
  expect(JSON.stringify(await adapter.getWorkspace('p1'))).not.toContain('agentCount')
})

it('reports credential metadata without reading secret values', async () => {
  let saved: Readonly<Record<string, unknown>> | undefined
  const adapter = new V1SettingsVaultAdapter({
    listCredentialRefs: () => [{ providerId: 'openai', ref: 'account:key' }],
    hasSecret: ref => ref === 'account:key',
    getSettings: () => ({ maxSteps: 20, trace: { enabled: false },
      lsp: { enabled: true, diagnosticsTimeoutMs: 3000 } }),
    saveSettings: async value => { saved = value }
  })

  await expect(adapter.credentialState()).resolves.toEqual({ openai: { configured: true } })
  await expect(adapter.update({ patch: { maxSteps: 30 } })).resolves.toBeUndefined()
  await adapter.update({ patch: { lsp: { enabled: false } } })
  expect(saved).toMatchObject({ lsp: { enabled: false, diagnosticsTimeoutMs: 3000 } })
  await expect(adapter.update({ patch: { maxSteps: 'many' } }))
    .rejects.toThrow('type mismatch')
  await expect(adapter.update({ patch: { unknownSetting: true } }))
    .rejects.toThrow('unknown setting')
  await expect(adapter.update({ patch: { apiKey: 'must-not-cross' } }))
    .rejects.toThrow('secret-bearing setting')
})

it('projects provider accounts without key references or raw credentials', async () => {
  const adapter = new V1ProviderAccountAdapter({
    listConnections: () => [{ providerId: 'openai', accounts: [{ id: 'account-1',
      providerId: 'openai', enabled: true, status: 'active', keyRef: 'secret-ref' }] }],
    connectMethod: async () => {}, refreshAccount: async () => {}, setEnabled: () => {}
  })

  const accounts = await adapter.listAccounts()

  expect(accounts).toEqual([{ id: 'account-1', providerId: 'openai', enabled: true,
    status: 'HEALTHY' }])
  expect(JSON.stringify(accounts)).not.toContain('secret-ref')
})

it('resolves secret-free runtime candidates without promoting declared tool support', async () => {
  const adapter = new V1ProviderAccountAdapter({
    listConnections: () => [{ providerId: 'openai', providerName: 'OpenAI', accounts: [{
      id: 'account-1', providerId: 'openai', label: 'Work account', enabled: true,
      status: 'active', keyRef: 'secret-ref', modelCatalog: [{ id: 'codex', name: 'Codex',
        capabilities: { supportsTools: true } }]
    }] }], connectMethod: async () => {}, refreshAccount: async () => {}, setEnabled: () => {}
  })

  const candidates = await adapter.listRuntimeTargets()

  expect(candidates).toEqual([{ id: 'openai/account-1/codex', providerName: 'OpenAI',
    accountLabel: 'Work account', modelName: 'Codex', accountStatus: 'HEALTHY', selectable: true,
    target: { providerId: 'openai', accountId: 'account-1', modelId: 'codex',
      capabilities: { structuredTools: 'UNKNOWN' } } }])
  expect(JSON.stringify(candidates)).not.toContain('secret-ref')
})

it('maps provider quota snapshots without exposing raw usage/account objects', async () => {
  const adapter = new V1ProviderAccountAdapter({ listConnections: () => [{ providerId: 'openai',
    accounts: [{ id: 'a1', providerId: 'openai', status: 'active', usage: {
      status: 'ok', primaryUsedPercent: 25, resetAt: Date.parse('2026-09-01T00:00:00.000Z'),
      refreshedAt: Date.parse('2026-08-31T00:00:00.000Z'), rawProvider: 'forbidden'
    } }] }], connectMethod: async () => {}, refreshAccount: async () => {}, setEnabled: () => {} })
  expect(await adapter.listQuotaSnapshots()).toEqual([{ providerId: 'openai', accountId: 'a1',
    status: 'AVAILABLE', remainingPercent: 75, resetAt: '2026-09-01T00:00:00.000Z',
    capturedAt: '2026-08-31T00:00:00.000Z' }])
})
