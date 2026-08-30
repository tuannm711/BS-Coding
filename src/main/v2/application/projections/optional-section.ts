import type { ProjectionSection } from '../../../../shared/v2/contracts/ui-projections'

export function sectionFromList<T>(items: readonly T[]): ProjectionSection<readonly T[]> {
  return items.length === 0 ? { status: 'EMPTY' } : { status: 'AVAILABLE', value: items }
}

export async function settleSection<T>(operation: Promise<ProjectionSection<T>>,
  errorCode: string): Promise<ProjectionSection<T>> {
  try {
    return await operation
  } catch {
    return { status: 'UNAVAILABLE', errorCode }
  }
}

export async function settleList<T>(operation: Promise<readonly T[]>,
  errorCode: string): Promise<ProjectionSection<readonly T[]>> {
  try {
    return sectionFromList(await operation)
  } catch {
    return { status: 'UNAVAILABLE', errorCode }
  }
}
