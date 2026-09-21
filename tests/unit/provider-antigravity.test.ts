import { describe, expect, it } from 'vitest'
import { createAntigravityAdapter } from '../../src/main/providers/adapters/antigravity'

describe('Antigravity Deprecation & Safety', () => {
  const adapter = createAntigravityAdapter()

  it('exposes unavailable status in definition to comply with ToS', () => {
    const def = adapter.definition()
    expect(def.id).toBe('antigravity')
    expect(def.status).toBe('unavailable')
  })

  it('rejects new connect requests with clear ToS notice', async () => {
    await expect(adapter.connect({
      providerId: 'antigravity',
      methodId: 'oauth',
      fields: {}
    }, {} as any)).rejects.toThrow('[bs] Antigravity OAuth cũ không còn được hỗ trợ để đảm bảo ToS Google')
  })

  it('handles existing legacy accounts without crashing and marks error status', async () => {
    const account: any = {
      id: 'acc_legacy_antigravity',
      providerId: 'antigravity',
      authMode: 'oauth',
      status: 'active'
    }

    const refreshed = await adapter.refreshAccount(account, {})
    expect(refreshed.status).toBe('error')
    expect(refreshed.lastError).toContain('ngừng hỗ trợ để tuân thủ ToS')
  })
})
