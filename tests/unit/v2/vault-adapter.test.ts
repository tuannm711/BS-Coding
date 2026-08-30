import { describe, expect, it } from 'vitest'
import { V1VaultAdapter, toSecretMetadata } from '../../../src/main/v2/infrastructure/vault/v1-vault-adapter'

describe('V2 vault adapter', () => {
  it('returns secret metadata without plaintext or masked values', () => {
    const metadata = toSecretMetadata('provider/openai/account-a', true)
    expect(metadata).toEqual({ ref: 'provider/openai/account-a', configured: true })
    expect(metadata).not.toHaveProperty('value')
    expect(metadata).not.toHaveProperty('masked')
  })

  it('forwards raw values only through the main-process vault port', async () => {
    const values = new Map<string, string>()
    const adapter = new V1VaultAdapter({
      getSecret: ref => values.get(ref) ?? null,
      saveSecret: (ref, value) => { values.set(ref, value) },
      deleteSecret: ref => { values.delete(ref) }
    })
    await adapter.set('provider/openai/a', 'secret-value')
    await expect(adapter.get('provider/openai/a')).resolves.toBe('secret-value')
    await expect(adapter.metadata('provider/openai/a')).resolves.toEqual({
      ref: 'provider/openai/a', configured: true
    })
    await adapter.delete('provider/openai/a')
    await expect(adapter.get('provider/openai/a')).resolves.toBeNull()
    await expect(adapter.metadata('provider/openai/a')).resolves.toEqual({
      ref: 'provider/openai/a', configured: false
    })
  })
})
