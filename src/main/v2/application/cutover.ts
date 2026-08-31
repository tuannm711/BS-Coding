export interface WriterConfiguration {
  v1Writable: boolean
  v2Writable: boolean
}

export function resolveWriterConfiguration(
  version: string,
  options: { forceV2?: boolean } = {}
): WriterConfiguration {
  const v2 = options.forceV2 === true || /^2\./.test(version)
  return v2 ? { v1Writable: false, v2Writable: true }
    : { v1Writable: true, v2Writable: false }
}

export function readOnlyArchiveStore<T>(source: { load(): T[] }): {
  load(): T[]
  save(items: T[]): void
} {
  return {
    load: () => source.load(),
    save: () => { throw new Error('legacy session store is a read-only archive after V2 cutover') }
  }
}
