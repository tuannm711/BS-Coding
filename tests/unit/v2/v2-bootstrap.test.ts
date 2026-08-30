import { describe, expect, it, vi } from 'vitest'
import { createV2Runtime } from '../../../src/main/v2/application/v2-bootstrap'
import { V2_SCHEMA_VERSION } from '../../../src/shared/v2/contracts/version'

describe('v2 bootstrap gate', () => {
  it('does not start services when disabled', async () => {
    const start = vi.fn()
    const rt = await createV2Runtime({ enabled: false, start })
    expect(rt.enabled).toBe(false)
    expect(start).not.toHaveBeenCalled()
    await rt.dispose()
  })

  it('reports enabled and disposes owned resources exactly once', async () => {
    const dispose = vi.fn(async () => {})
    const start = vi.fn(async () => ({ dispose }))
    const rt = await createV2Runtime({ enabled: true, start })
    expect(rt.enabled).toBe(true)
    await rt.dispose()
    await rt.dispose()
    expect(start).toHaveBeenCalledOnce()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('exposes a schema version string', () => {
    expect(typeof V2_SCHEMA_VERSION).toBe('string')
    expect(V2_SCHEMA_VERSION.length).toBeGreaterThan(0)
  })
})
