import type { EntityId } from '../../../../shared/v2/contracts/common'

// A source of fresh entity ids. Injected so runtime logic stays deterministic
// under test; infrastructure supplies the real one.
export interface IdGenerator {
  next(): EntityId
}
