import type { ElectronApplication } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function seedOpenAiFixtureAccount(userData: string, id: string) {
  mkdirSync(path.join(userData, 'connections'), { recursive: true })
  writeFileSync(path.join(userData, 'connections', 'accounts.json'), JSON.stringify({ version: 1, connections: [{
    providerId: 'openai', activeAccountId: id, accounts: [{ id, providerId: 'openai', label: 'Fixture account', authMode: 'api-key', status: 'active', keyRef: 'fixture:openai', models: ['gpt-5.6-sol', 'gpt-5.6-luna'], createdAt: 1, lastUsedAt: 1 }]
  }] }))
}

export async function writeOpenAiFixtureVault(app: ElectronApplication, userData: string) {
  const secret = await app.evaluate(({ safeStorage }) => safeStorage.encryptString(JSON.stringify({ apiKey: 'fixture-key', baseUrl: 'http://127.0.0.1:1/v1' })).toString('base64'))
  writeFileSync(path.join(userData, 'connections', 'vault.json'), JSON.stringify({ 'fixture:openai': secret }))
}
