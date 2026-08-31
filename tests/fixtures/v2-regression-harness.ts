import { z } from 'zod'
import { ContextCompiler } from '../../src/main/v2/runtime/context/context-compiler'
import { projectContext, type NativeContextMessage } from '../../src/main/v2/runtime/providers/native-context-projector'
import { EventAssembler } from '../../src/main/v2/runtime/canonical/event-assembler'
import { ProtocolGuard, type ProtocolDecision, type RegisteredTool } from '../../src/main/v2/runtime/tools/protocol-guard'
import { ToolExecutor } from '../../src/main/v2/runtime/tools/tool-executor'
import { AccountRouter } from '../../src/main/v2/runtime/routing/account-router'
import { createRuntimeEpochService, type EpochRecord } from '../../src/main/v2/application/runtime/runtime-epoch-service'
import { openV2Database } from '../../src/main/v2/infrastructure/persistence/database'
import { migrate } from '../../src/main/v2/infrastructure/persistence/migration-runner'
import { SqliteEventStore } from '../../src/main/v2/infrastructure/persistence/sqlite-event-store'
import type { EventToAppend } from '../../src/main/v2/application/ports/event-store'
import type { CanonicalEvent } from '../../src/shared/v2/contracts/events'

const timestamp = '2026-09-01T00:00:00.000Z'
const registry = (): Map<string, RegisteredTool> => new Map([['read', { definition: { name: 'read', description: 'Read',
  permissionCategory: 'filesystem.read', sideEffectLevel: 'NONE' as const,
  supportsCancellation: true, outputPolicy: 'INLINE' as const },
argumentsSchema: z.object({ path: z.string().min(1) }) }],
['write', { definition: { name: 'write', description: 'Write',
  permissionCategory: 'filesystem.write', sideEffectLevel: 'LOCAL_WRITE' as const,
  supportsCancellation: true, outputPolicy: 'ARTIFACT' as const },
argumentsSchema: z.object({ path: z.string().min(1) }) }]])

export class RuntimePortabilityHarness {
  private readonly db = openV2Database(':memory:')
  private readonly store = new SqliteEventStore(this.db)
  private readonly guard = new ProtocolGuard(registry())
  private readonly executor = new ToolExecutor({ record: async () => {} })
  private readonly effects = new Map<string, number>()
  private eventId = 0

  private constructor() { migrate(this.db) }
  static async create(): Promise<RuntimePortabilityHarness> { return new RuntimePortabilityHarness() }

  async persistModelAToolTurn(): Promise<void> {
    const assembler = new EventAssembler()
    assembler.accept({ kind: 'tool.call.completed', call: { callId: 'call-a', toolName: 'read',
      arguments: { path: 'a.ts' }, origin: 'model', requestedAt: timestamp } })
    assembler.accept({ kind: 'tool.result.completed', result: { callId: 'call-a', status: 'success',
      preview: 'source', completedAt: timestamp } })
    const events: EventToAppend[] = assembler.finish().map(draft => ({ id: this.nextEventId(),
      type: draft.type, schemaVersion: 1, timestamp, projectId: 'project-1',
      workSessionId: 'work-1', workflowRunId: 'workflow-1', taskRunId: 'task-1',
      agentRunId: 'agent-run-1', runtimeEpochId: 'epoch-a', correlationId: 'turn-a',
      payload: draft.payload }))
    await this.store.append('work-1', 0, events)
  }

  async restartAndProjectForModelB(): Promise<NativeContextMessage[]> {
    const restartedStore = new SqliteEventStore(this.db)
    const compiler = new ContextCompiler({
      loadEvents: async id => (await restartedStore.load(id))
        .map(event => ({ ...event }) as CanonicalEvent & Record<string, unknown>),
      loadSystem: async () => ['Use structured tools'],
      loadArtifacts: async () => []
    })
    const packet = await compiler.compileForAgentRun({ workSessionId: 'work-1', taskRunId: 'task-1',
      agentRunId: 'agent-run-1', goal: 'Continue on Model B', maxInputTokens: 4_000 })
    return projectContext(packet, { structuredToolHistory: true })
  }

  async feedModelBText(text: string): Promise<void> {
    const decision = this.guard.acceptAssistantText(text)
    if (decision.ok) await this.execute(decision)
  }

  async feedModelBToolCall(input: { callId: string; toolName: string;
    arguments: Record<string, unknown> }): Promise<void> {
    const decision = this.guard.validateToolCall({ ...input, origin: 'model', requestedAt: timestamp })
    if (!decision.ok) throw new Error(decision.code)
    await this.execute(decision)
  }

  toolSideEffects(name: string): number { return this.effects.get(name) ?? 0 }
  dispose(): void { this.db.close() }

  private async execute(decision: Extract<ProtocolDecision, { ok: true }>): Promise<void> {
    await this.executor.execute(decision.call, async () => {
      this.effects.set(decision.call.toolName, this.toolSideEffects(decision.call.toolName) + 1)
      return { ok: true }
    })
  }
  private nextEventId(): string { this.eventId += 1; return `event-${this.eventId}` }
}

export class ToolProtocolHarness {
  private readonly guard = new ProtocolGuard(registry())
  private readonly executor = new ToolExecutor({ record: async () => {} })
  readonly protocolViolations: string[] = []
  sideEffects = 0

  async acceptText(text: string): Promise<void> {
    const decision = this.guard.acceptAssistantText(text)
    if (!decision.ok) this.protocolViolations.push(decision.code)
  }

  async acceptStructured(input: { callId: string; toolName: string;
    arguments: Record<string, unknown> }): Promise<string> {
    const decision = this.guard.validateToolCall({ ...input, origin: 'model', requestedAt: timestamp })
    if (!decision.ok) return decision.code
    return this.executor.execute(decision.call, async () => {
      this.sideEffects += 1
      await Promise.resolve()
      return `written:${String((decision.call.arguments as { path: string }).path)}`
    })
  }
}

export class RoutingRegressionHarness {
  readonly lifecycleEvents: string[] = []
  private readonly router = new AccountRouter()
  private readonly epochs = new Map<string, EpochRecord>()
  private readonly candidates = [
    { id: 'account-a', providerId: 'provider', modelId: 'model', enabled: true, cooldown: false,
      quotaKnown: true, remaining: 80, activeRuns: 0, structuredTools: 'VERIFIED' as const },
    { id: 'account-b', providerId: 'provider', modelId: 'model', enabled: true, cooldown: false,
      quotaKnown: true, remaining: 60, activeRuns: 0, structuredTools: 'VERIFIED' as const }
  ]

  routeInitial() {
    const target = this.router.route({ policy: 'AUTO', candidates: this.candidates,
      requireStructuredTools: true, runtimeEpochId: 'epoch-1' })
    this.epochs.set('epoch-1', { id: 'epoch-1', workSessionId: 'work-1', agentRunId: 'agent-run-1',
      status: 'ACTIVE', target, startedAt: timestamp })
    return target
  }

  async refusePoolAndFallback() {
    this.router.releaseEpoch('epoch-1')
    const fallback = this.router.route({ policy: 'AUTO', candidates: [
      { ...this.candidates[0], cooldown: true }, this.candidates[1]
    ], requireStructuredTools: true, runtimeEpochId: 'epoch-2' })
    const service = createRuntimeEpochService({
      findActive: async () => this.epochs.get('epoch-1') ?? null,
      save: async epoch => { this.epochs.set(epoch.id, epoch) },
      appendLifecycle: async event => { this.lifecycleEvents.push(event.type) },
      nextId: () => 'epoch-2', now: () => timestamp,
      transaction: async operation => operation()
    })
    await service.switchRuntime({ workSessionId: 'work-1', agentRunId: 'agent-run-1',
      target: fallback, reason: 'quota-refusal' })
    const oldEpoch = this.epochs.get('epoch-1')!
    const newEpoch = this.epochs.get('epoch-2')!
    return { workSessionId: newEpoch.workSessionId, agentRunId: newEpoch.agentRunId,
      oldEpoch: { id: oldEpoch.id, status: oldEpoch.status, accountId: oldEpoch.target.accountId },
      newEpoch: { id: newEpoch.id, status: newEpoch.status, accountId: newEpoch.target.accountId } }
  }
}
