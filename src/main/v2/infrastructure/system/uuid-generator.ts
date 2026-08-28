import { randomUUID } from 'node:crypto'
import type { EntityId } from '../../../../shared/v2/contracts/common'
import type { IdGenerator } from '../../application/ports/id-generator'

export class UuidGenerator implements IdGenerator {
  next(): EntityId {
    return randomUUID()
  }
}
