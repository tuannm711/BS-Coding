export interface V2Runtime {
  readonly enabled: boolean
  dispose(): Promise<void>
}

export interface V2BootstrapInput {
  enabled: boolean
  userDataPath: string
}

// Side-by-side V2 entry point. While disabled it starts nothing and owns no
// resources, so it can ship in every build without touching V1 behavior. When
// enabled it will assemble the V2 services; today it only reports the gate and
// disposes cleanly, so the seam exists before anything depends on it.
export async function createV2Runtime(input: V2BootstrapInput): Promise<V2Runtime> {
  if (!input.enabled) {
    return { enabled: false, dispose: async () => {} }
  }
  return { enabled: true, dispose: async () => {} }
}
