import type { SafeSettingsSummary } from '../../../../shared/v2/contracts/ui-projections'

interface LegacySettingsVaultEdge {
  listCredentialRefs(): readonly { providerId: string; ref: string }[]
  hasSecret(ref: string): boolean
  getSettings(): Readonly<Record<string, unknown>>
  saveSettings(settings: Readonly<Record<string, unknown>>): Promise<unknown>
}

const secretKey = /(?:api[-_]?key|secret|token|password|credential)/i

function mergePatch(current: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>, path = 'settings'): Record<string, unknown> {
  const result = structuredClone(current) as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    const field = `${path}.${key}`
    if (secretKey.test(key)) throw new Error(`secret-bearing setting is forbidden at ${field}`)
    if (!Object.hasOwn(current, key)) throw new Error(`unknown setting at ${field}`)
    const existing = current[key]
    if (Array.isArray(existing)) {
      if (!Array.isArray(value)) throw new Error(`setting type mismatch at ${field}`)
      result[key] = structuredClone(value)
    } else if (existing !== null && typeof existing === 'object') {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`setting type mismatch at ${field}`)
      }
      result[key] = mergePatch(existing as Readonly<Record<string, unknown>>,
        value as Readonly<Record<string, unknown>>, field)
    } else {
      if (typeof value !== typeof existing) throw new Error(`setting type mismatch at ${field}`)
      result[key] = value
    }
  }
  return result
}

// Delete at P18 after V2 settings and vault metadata projections are authoritative.
export class V1SettingsVaultAdapter {
  constructor(private readonly legacy: LegacySettingsVaultEdge) {}

  async credentialState(): Promise<SafeSettingsSummary['providerCredentials']> {
    const configured: Record<string, { configured: boolean }> = {}
    for (const item of this.legacy.listCredentialRefs()) {
      configured[item.providerId] = {
        configured: (configured[item.providerId]?.configured ?? false) || this.legacy.hasSecret(item.ref)
      }
    }
    return configured
  }

  async update(input: { patch: Readonly<Record<string, unknown>> }): Promise<void> {
    await this.legacy.saveSettings(mergePatch(this.legacy.getSettings(), input.patch))
  }
}
