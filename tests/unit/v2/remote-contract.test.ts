import { describe, expect, expectTypeOf, it } from 'vitest'
import type { RemoteControlPort } from '../../../src/main/v2/application/ports/remote-control-port'
import { PairingStatusSchema } from '../../../src/shared/v2/schemas/remote'

describe('V2 remote control contract', () => {
  it('strips credentials and project content from pairing status DTOs', () => {
    const parsed = PairingStatusSchema.parse({
      enabled: true, state: 'PAIRING', code: '482731',
      expiresAt: '2026-09-01T00:05:00.000Z', token: 'secret', projectPath: 'C:/private',
      devices: [{
        id: 'phone-1', name: 'Phone', status: 'ONLINE', token: 'device-secret',
        projectContent: 'private source'
      }]
    })

    expect(parsed).toEqual({
      enabled: true, state: 'PAIRING', code: '482731',
      expiresAt: '2026-09-01T00:05:00.000Z',
      devices: [{ id: 'phone-1', name: 'Phone', status: 'ONLINE' }]
    })
    expect(JSON.stringify(parsed)).not.toMatch(/secret|project|token/i)
  })

  it('rejects malformed pairing codes', () => {
    expect(PairingStatusSchema.safeParse({
      enabled: true, state: 'PAIRING', code: '12345', devices: []
    }).success).toBe(false)
    expect(PairingStatusSchema.safeParse({
      enabled: true, state: 'PAIRING', code: '123456', devices: []
    }).success).toBe(false)
  })

  it('defines lifecycle, pairing, revocation and cleanup subscription operations', () => {
    expectTypeOf<RemoteControlPort>().toHaveProperty('setEnabled')
    expectTypeOf<RemoteControlPort>().toHaveProperty('startPairing')
    expectTypeOf<RemoteControlPort>().toHaveProperty('revokeDevice')
    expectTypeOf<RemoteControlPort>().toHaveProperty('subscribe')
  })
})
