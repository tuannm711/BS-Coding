export interface V2Runtime {
  readonly enabled: boolean
  dispose(): Promise<void>
}

export interface V2BootstrapInput {
  enabled: boolean
  start?: () => Promise<{ dispose(): Promise<void> | void }>
}

// Side-by-side V2 entry point. While disabled it starts nothing and owns no
// resources, so it can ship in every build without touching V1 behavior. When
// enabled it owns the composed resource bundle and guarantees idempotent cleanup.
export async function createV2Runtime(input: V2BootstrapInput): Promise<V2Runtime> {
  if (!input.enabled) {
    return { enabled: false, dispose: async () => {} }
  }
  const resources = await input.start?.()
  let disposed = false
  return { enabled: true, dispose: async () => {
    if (disposed) return
    disposed = true
    await resources?.dispose()
  } }
}
