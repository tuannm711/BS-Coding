import type { IsoDateTime } from '../../../../shared/v2/contracts/common'
import type { Clock } from '../../application/ports/clock'

export class SystemClock implements Clock {
  now(): IsoDateTime {
    return new Date().toISOString()
  }
}
