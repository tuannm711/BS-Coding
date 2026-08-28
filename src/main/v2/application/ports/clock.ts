import type { IsoDateTime } from '../../../../shared/v2/contracts/common'

// A source of the current instant. Injected so runtime logic stays deterministic
// under test; infrastructure supplies the real one.
export interface Clock {
  now(): IsoDateTime
}
