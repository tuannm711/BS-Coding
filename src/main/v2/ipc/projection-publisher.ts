import type { ProjectionEvent } from '../../../shared/v2/contracts/ipc'
import { ProjectionEventSchema } from '../../../shared/v2/schemas/ipc'

export function createProjectionPublisher(deps: {
  send(event: ProjectionEvent<unknown>): void
}) {
  let sequence = 0
  return {
    publish<T>(revision: number, payload: T): ProjectionEvent<T> {
      const event = ProjectionEventSchema.parse({
        sequence: sequence + 1,
        revision,
        payload
      }) as ProjectionEvent<T>
      sequence = event.sequence
      deps.send(event)
      return event
    }
  }
}
