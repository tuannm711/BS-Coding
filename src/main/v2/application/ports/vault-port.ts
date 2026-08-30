export interface SecretMetadata {
  ref: string
  configured: boolean
}

export interface VaultPort {
  get(ref: string): Promise<string | null>
  set(ref: string, value: string): Promise<void>
  delete(ref: string): Promise<void>
  metadata(ref: string): Promise<SecretMetadata>
}
