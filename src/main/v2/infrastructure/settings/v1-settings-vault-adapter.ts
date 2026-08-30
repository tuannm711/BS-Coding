import type { SafeSettingsSummary } from '../../../../shared/v2/contracts/ui-projections'

interface LegacySettingsVaultEdge {
  listCredentialRefs(): readonly { providerId: string; ref: string }[]
  hasSecret(ref: string): boolean
  getSettings(): Readonly<Record<string, unknown>>
  saveSettings(settings: Readonly<Record<string, unknown>>): Promise<unknown>
}

const secretKey = /(?:api[-_]?key|secret|token|password|credential)/i

function assertSafePatch(value: unknown, path = 'settings'): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (secretKey.test(key)) throw new Error(`secret-bearing setting is forbidden at ${path}.${key}`)
    assertSafePatch(child, `${path}.${key}`)
  }
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
    assertSafePatch(input.patch)
    await this.legacy.saveSettings({ ...this.legacy.getSettings(), ...input.patch })
  }
}
