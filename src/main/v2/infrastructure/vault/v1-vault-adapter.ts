import type { SecretMetadata, VaultPort } from '../../application/ports/vault-port'

interface LegacyVaultEdge {
  getSecret(ref: string): string | null
  saveSecret(ref: string, value: string): void
  deleteSecret(ref: string): void
}

export function toSecretMetadata(ref: string, configured = true): SecretMetadata {
  return Object.freeze({ ref, configured })
}

export class V1VaultAdapter implements VaultPort {
  constructor(private readonly legacy: LegacyVaultEdge) {}

  private ref(value: string): string {
    const normalized = value.trim()
    if (!normalized) throw new Error('secret reference is required')
    return normalized
  }

  async get(ref: string): Promise<string | null> {
    return this.legacy.getSecret(this.ref(ref))
  }

  async set(ref: string, value: string): Promise<void> {
    if (!value) throw new Error('secret value is required')
    this.legacy.saveSecret(this.ref(ref), value)
  }

  async delete(ref: string): Promise<void> {
    this.legacy.deleteSecret(this.ref(ref))
  }

  async metadata(ref: string): Promise<SecretMetadata> {
    const normalized = this.ref(ref)
    return toSecretMetadata(normalized, this.legacy.getSecret(normalized) !== null)
  }
}
