import { describe, expect, it } from 'vitest'
import { createV2Runtime } from '../../../src/main/v2/application/v2-bootstrap'
import { V2_SCHEMA_VERSION } from '../../../src/shared/v2/contracts/version'

describe('v2 bootstrap gate', () => {
  it('does not start services when disabled', async () => {
    const rt = await createV2Runtime({ enabled: false, userDataPath: 'x' })
    expect(rt.enabled).toBe(false)
    await rt.dispose()
  })

  it('reports enabled and disposes cleanly when enabled', async () => {
    const rt = await createV2Runtime({ enabled: true, userDataPath: 'x' })
    expect(rt.enabled).toBe(true)
    await rt.dispose()
  })

  it('exposes a schema version string', () => {
    expect(typeof V2_SCHEMA_VERSION).toBe('string')
    expect(V2_SCHEMA_VERSION.length).toBeGreaterThan(0)
  })
})
