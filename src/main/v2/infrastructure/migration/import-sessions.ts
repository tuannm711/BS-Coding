import { z } from 'zod'
import type { EventStore, EventToAppend } from '../../application/ports/event-store'
import { redactEventPayload } from '../../runtime/canonical/event-redaction'
import type { V2Repositories } from '../persistence/repositories'
import { stableImportId } from './import-key'
import { convertLegacyItem } from './v1-transcript-converter'

const epochMillis = z.number().nonnegative().max(8_640_000_000_000_000)
const LegacySessionSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  projectPath: z.string().min(1),
  kind: z.enum(['work', 'coordination']).optional(),
  title: z.string().min(1),
  items: z.array(z.unknown()),
  createdAt: epochMillis,
  updatedAt: epochMillis
})

export interface SessionImportResult {
  imported: number
  skipped: number
  archived: number
  importedIds: string[]
  archivedLegacyIds: string[]
}

interface SessionImportDependencies {
  repositories: Pick<V2Repositories, 'workSessions' | 'importHistory'>
  events: EventStore
}

function attributed(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false
  const candidate = item as { kind?: unknown; message?: unknown; tool?: unknown }
  const content = candidate.kind === 'message' ? candidate.message
    : candidate.kind === 'tool' ? candidate.tool : null
  if (!content || typeof content !== 'object') return false
  if (candidate.kind === 'message' && (content as { role?: unknown }).role === 'user') return true
  const execution = (content as { execution?: unknown }).execution
  return Boolean(execution && typeof execution === 'object'
    && typeof (execution as { agentId?: unknown }).agentId === 'string'
    && (execution as { agentId: string }).agentId.length > 0)
}

function iso(value: number): string {
  return new Date(value).toISOString()
}

export async function importSessions(
  values: readonly unknown[],
  dependencies: SessionImportDependencies
): Promise<SessionImportResult> {
  const importedIds: string[] = []
  const archivedLegacyIds: string[] = []
  let imported = 0
  let skipped = 0
  for (const value of values) {
    const legacy = LegacySessionSchema.parse(value)
    const projectId = await dependencies.repositories.importHistory.get(
      'v1:project', legacy.projectPath
    )
    const ambiguous = !projectId
      || (legacy.kind === 'coordination' && legacy.items.some(item => !attributed(item)))
    if (ambiguous) {
      await dependencies.repositories.importHistory.record(
        'v1:session-archive', legacy.id, `legacy-archive:${legacy.id}`
      )
      archivedLegacyIds.push(legacy.id)
      continue
    }

    const recordedId = await dependencies.repositories.importHistory.get('v1:session', legacy.id)
    const id = recordedId ?? stableImportId('work-session', legacy.id)
    const existingSession = await dependencies.repositories.workSessions.get(id)
    const createdAt = iso(legacy.createdAt)
    const updatedAt = iso(legacy.updatedAt)
    if (!existingSession) {
      await dependencies.repositories.workSessions.save({
        id, projectId, title: legacy.title, goal: legacy.title, status: 'COMPLETED',
        createdAt, updatedAt, completedAt: updatedAt
      })
    }

    const drafts = legacy.items.flatMap(item => convertLegacyItem(item, createdAt))
    const desired: EventToAppend[] = drafts.map((draft, index) => ({
      id: stableImportId('event', `${legacy.id}:${index}`), schemaVersion: 1,
      timestamp: draft.timestamp, type: draft.type, projectId, workSessionId: id,
      correlationId: draft.correlationId, payload: redactEventPayload(draft.payload)
    }))
    const current = await dependencies.events.latestSequence(id)
    if (current > desired.length) throw new Error('legacy session has fewer events than prior import')
    const existingEvents = await dependencies.events.load(id)
    if (existingEvents.some((event, index) => event.id !== desired[index]?.id)) {
      throw new Error('legacy session event prefix does not match prior import')
    }
    if (current < desired.length) {
      await dependencies.events.append(id, current, desired.slice(current))
    }
    await dependencies.repositories.importHistory.record('v1:session', legacy.id, id)
    importedIds.push(id)
    if (!recordedId || !existingSession || current < desired.length) imported += 1
    else skipped += 1
  }
  return { imported, skipped, archived: archivedLegacyIds.length, importedIds, archivedLegacyIds }
}
