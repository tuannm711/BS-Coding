import type { ExecutionCorrelation } from '../../../shared/v2/contracts/domain'

export function correlationOf(input: ExecutionCorrelation): ExecutionCorrelation {
  return { ...input }
}
