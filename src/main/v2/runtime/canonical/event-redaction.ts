import { redactObject } from '../../application/security/redaction-service'

export function redactEventPayload<T>(value: T): T {
  return redactObject(value)
}
