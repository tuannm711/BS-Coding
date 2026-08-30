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

  async get(ref: string): Promise<string | null> {
    return this.legacy.getSecret(ref)
  }

  async set(ref: string, value: string): Promise<void> {
    this.legacy.saveSecret(ref, value)
  }

  async delete(ref: string): Promise<void> {
    this.legacy.deleteSecret(ref)
  }

  async metadata(ref: string): Promise<SecretMetadata> {
    return toSecretMetadata(ref, this.legacy.getSecret(ref) !== null)
  }
}
