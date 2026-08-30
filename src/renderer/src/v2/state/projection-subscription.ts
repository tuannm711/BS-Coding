import type { ProjectionEvent } from '../../../../shared/v2/contracts/ipc'

export function needsRefetch(lastSequence: number, nextSequence: number): boolean {
  return nextSequence !== lastSequence + 1
}

export function createProjectionSubscription<T>(deps: {
  subscribe(callback: (event: ProjectionEvent<T>) => void): () => void
  refetch(): Promise<ProjectionEvent<T>>
  apply(event: ProjectionEvent<T>): void
}) {
  let lastSequence = 0
  let disposed = false
  let refetching: Promise<void> | undefined

  const onEvent = (event: ProjectionEvent<T>): void => {
    if (disposed || refetching || event.sequence <= lastSequence) return
    if (needsRefetch(lastSequence, event.sequence)) {
      refetching = deps.refetch().then(snapshot => {
        if (disposed) return
        lastSequence = snapshot.sequence
        deps.apply(snapshot)
      }).finally(() => { refetching = undefined })
      return
    }
    lastSequence = event.sequence
    deps.apply(event)
  }

  const unsubscribe = deps.subscribe(onEvent)
  return {
    whenIdle: async (): Promise<void> => { await refetching },
    dispose: (): void => {
      if (disposed) return
      disposed = true
      unsubscribe()
    }
  }
}
