import type {
  AgentDefinition, Project, Task, WorkflowRun, WorkSession
} from '../../../shared/v2/contracts/domain'
import type { RuntimeTarget, RuntimeTargetCandidateSummary } from '../../../shared/v2/contracts/provider'
import type { ReviewFinding, ReviewRecord } from '../../../shared/v2/contracts/review'
import type { OutputSummary, SafeSettingsSummary, TerminalSummary, TestRunSummary
} from '../../../shared/v2/contracts/ui-projections'
import { transitionWorkflow } from '../domain/workflow/workflow-state'
import type { EventStore } from './ports/event-store'
import type { CommandIdempotencyPort } from './ports/command-idempotency-port'
import type { ProjectionReadPort } from './ports/projection-read-port'
import type { ProjectionSupportPort } from './ports/projection-support-port'
import { createAgentSettingsCommands } from './commands/agent-settings-commands'
import { createWorkSessionCommands } from './commands/work-session-commands'
import { runIdempotentCommand, runIdempotentExternalCommand } from './commands/idempotent-command'
import { createAgentSettingsProjectionService } from './projections/agent-settings-projections'
import { createBottomPanelProjectionService } from './projections/bottom-panel-projections'
import { createProjectProjectionService, ProjectionNotFoundError } from './projections/project-projections'
import { createWorkProjectionService } from './projections/work-projections'
import { createRuntimeEpochService } from './runtime/runtime-epoch-service'
import { createReworkRequestService } from './review/rework-service'
import { createDiagnosticsService } from './observability/diagnostics-service'
import type { UsageLedger } from './observability/usage-ledger'
import type { QuotaSnapshot } from '../../../shared/v2/contracts/usage'
import { evaluateBudget, type BudgetPolicyPort } from './observability/budget-evaluator'

type JsonPatch = Readonly<Record<string, unknown>>
const PROJECTION_EVENT_LIMIT = 1000

export interface V2CompositionSupport extends ProjectionSupportPort {
  credentialState(): Promise<SafeSettingsSummary['providerCredentials']>
  listTerminals(projectId: string, workflowRunId: string, limit: number): Promise<readonly TerminalSummary[]>
  listTests(projectId: string, workflowRunId: string, limit: number): Promise<readonly TestRunSummary[]>
  listOutput(projectId: string, workflowRunId: string, limit: number): Promise<readonly OutputSummary[]>
  connectProvider(input: { scopeId: string; providerId: string; apiKey: string }): Promise<void>
  refreshProvider(input: { scopeId: string; providerId: string }): Promise<void>
  setProviderEnabled(input: { scopeId: string; accountId: string; enabled: boolean }): Promise<void>
  probeProvider(input: { scopeId: string; providerId: string }): Promise<void>
  updateSettings(input: { scopeId: string; patch: JsonPatch }): Promise<void>
  listRuntimeTargets(projectId: string,
    workSessionId: string): Promise<readonly RuntimeTargetCandidateSummary[]>
  listQuotaSnapshots(): Promise<readonly QuotaSnapshot[]>
  remoteStatus(): Promise<{ enabled: boolean; status: string }>
}

export interface CreateV2ServicesInput {
  repositories: V2ServiceRepositories
  events: EventStore
  support: V2CompositionSupport
  usage: UsageLedger
  budgets: BudgetPolicyPort
  transaction<T>(operation: () => Promise<T>): Promise<T>
  publishWorkflow?(workflow: WorkflowRun, revision: number): Promise<void> | void
  now?: () => string
  nextId?: () => string
}

interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | null>
  save(value: T): Promise<void>
}

export interface V2RuntimeEpochRecord {
  id: string
  agentRunId: string
  workSessionId: string
  status: 'STARTING' | 'ACTIVE' | 'CLOSING' | 'CLOSED'
  providerId: string
  accountId: string
  modelId: string
  reason: string
  startedAt: string
  endedAt?: string
  endReason?: string
}

interface RuntimeEpochRepository extends Repository<V2RuntimeEpochRecord> {
  findActiveByAgentRun(agentRunId: string): Promise<V2RuntimeEpochRecord | null>
}

export interface V2ServiceRepositories {
  projects: Repository<Project>
  workSessions: Repository<WorkSession>
  workflowRuns: Repository<WorkflowRun>
  tasks: Repository<Task>
  agentDefinitions: Repository<AgentDefinition>
  runtimeEpochs: RuntimeEpochRepository
  reviews: Repository<ReviewRecord>
  findings: Repository<ReviewFinding>
  projections: ProjectionReadPort
  commandIdempotency: CommandIdempotencyPort
}

type Input = Record<string, unknown>

function available<T>(section: Awaited<ReturnType<ProjectionSupportPort['getGitStatus']>> |
  { status: 'AVAILABLE'; value: T } | { status: 'EMPTY' } | { status: 'UNAVAILABLE'; errorCode: string },
  label: string): T {
  if (section.status === 'AVAILABLE') return section.value as T
  if (section.status === 'EMPTY') throw new Error(`${label} is empty`)
  throw new Error(`${label} unavailable: ${section.errorCode}`)
}

function sessionStatus(status: WorkflowRun['status']): WorkSession['status'] {
  if (status === 'PAUSED' || status === 'BLOCKED' || status === 'FAILED' || status === 'CANCELLED' ||
      status === 'COMPLETED') return status
  if (status === 'REVIEWING') return 'REVIEW'
  if (status === 'REWORKING') return 'REWORK'
  if (status === 'VERIFYING') return 'VERIFYING'
  return status === 'EXECUTING' || status === 'INTEGRATING' ? 'EXECUTING' : 'PLANNING'
}

export function createV2Services(input: CreateV2ServicesInput) {
  const repositories = input.repositories
  const now = input.now ?? (() => new Date().toISOString())
  const nextId = input.nextId ?? (() => crypto.randomUUID())
  const revision = async (aggregateId: string) => {
    return input.events.latestSequence(aggregateId)
  }
  const transaction = input.transaction
  const projectProjections = createProjectProjectionService({
    reads: repositories.projections, support: input.support, revision
  })
  const workProjections = createWorkProjectionService({
    reads: repositories.projections,
    loadEvents: id => input.events.loadRecent(id, PROJECTION_EVENT_LIMIT), revision
  })
  const listAgents = async (projectId: string) =>
    (await repositories.projections.listAgentDefinitionsByProject(projectId)).map(agent => ({
      id: agent.id, name: agent.name, role: agent.role,
      status: agent.archivedAt ? 'DISABLED' as const : 'READY' as const,
      ...(agent.currentVersionId ? { currentVersionId: agent.currentVersionId } : {})
    }))
  const settings = createAgentSettingsProjectionService({ revision, listAgents,
    listProviderAccounts: () => input.support.listProviderAccounts(),
    credentialState: () => input.support.credentialState() })
  const diagnostics = createDiagnosticsService()
  const bottom = createBottomPanelProjectionService({ revision,
    terminals: (projectId, workflowRunId, limit) => input.support.listTerminals(projectId, workflowRunId, limit),
    tests: (projectId, workflowRunId, limit) => input.support.listTests(projectId, workflowRunId, limit),
    problems: async (projectId, workflowRunId) => {
      const section = await input.support.listDiagnostics(projectId, workflowRunId)
      return section.status === 'AVAILABLE' ? section.value : []
    },
    logs: async (_projectId, workflowRunId, limit) => diagnostics
      .project(await input.events.loadRecent(workflowRunId, limit)).map(entry => ({ id: entry.id,
        occurredAt: entry.timestamp, level: entry.level === 'WARN' ? 'WARNING' as const : entry.level,
        message: `[${entry.code}] ${entry.message}` })),
    output: (projectId, workflowRunId, limit) => input.support.listOutput(projectId, workflowRunId, limit) })

  const resolveWork = async (projectId: string, workSessionId: string) => {
    const work = await repositories.projections.getWorkSessionOwnedByProject(projectId, workSessionId)
    if (!work?.activeWorkflowRunId) return null
    const activeRuns = await repositories.projections.listAgentRunsByWorkflow(work.activeWorkflowRunId)
    return { workSessionId: work.id, workflowRunId: work.activeWorkflowRunId,
      ...(activeRuns.find(run => run.status === 'RUNNING') ?
        { agentRunId: activeRuns.find(run => run.status === 'RUNNING')!.id } : {}) }
  }
  const runtime = createRuntimeEpochService({
    findActive: async agentRunId => {
      const epoch = await repositories.runtimeEpochs.findActiveByAgentRun(agentRunId)
      return epoch ? { id: epoch.id, agentRunId: epoch.agentRunId,
        workSessionId: epoch.workSessionId, status: epoch.status,
        target: { providerId: epoch.providerId, accountId: epoch.accountId, modelId: epoch.modelId },
        reason: epoch.reason, startedAt: epoch.startedAt,
        endedAt: epoch.endedAt, endReason: epoch.endReason } : null
    },
    save: epoch => repositories.runtimeEpochs.save({ id: epoch.id, agentRunId: epoch.agentRunId,
      workSessionId: epoch.workSessionId, status: epoch.status,
      providerId: epoch.target.providerId, accountId: epoch.target.accountId,
      modelId: epoch.target.modelId, reason: epoch.reason ?? 'RUNTIME_SWITCH',
      startedAt: epoch.startedAt ?? now(), endedAt: epoch.endedAt, endReason: epoch.endReason }),
    appendLifecycle: async event => {
      const session = await repositories.workSessions.get(event.workSessionId)
      if (!session?.activeWorkflowRunId) throw new Error('active WorkflowRun is required')
      const timestamp = now()
      await input.events.append(session.activeWorkflowRunId,
        await input.events.latestSequence(session.activeWorkflowRunId), [{
        id: nextId(), type: 'LIFECYCLE', schemaVersion: 1, timestamp,
        projectId: session.projectId, workSessionId: session.id,
        workflowRunId: session.activeWorkflowRunId, agentRunId: event.agentRunId,
        runtimeEpochId: event.epochId, correlationId: event.epochId,
        payload: { kind: event.type }
      }])
    }, nextId, now, transaction
  })
  const rework = createReworkRequestService({ nextId, now, transaction,
    saveReworkTask: task => repositories.tasks.save({ id: task.id,
      workflowRunId: task.workflowRunId, title: task.title, dependsOn: [],
      createdAt: task.createdAt, updatedAt: task.createdAt }),
    linkFinding: async (findingId, taskId) => {
      const finding = await repositories.findings.get(findingId)
      if (!finding) throw new Error('unknown review finding')
      await repositories.findings.save({ ...finding, linkedReworkTaskId: taskId })
    }
  })
  const createOwnedRework = async (value: { workflowRunId: string; findingIds: readonly string[];
    title: string }) => {
    const owned = new Set((await repositories.projections.listFindingsByWorkflow(value.workflowRunId))
      .map(finding => finding.id))
    if (value.findingIds.some(id => !owned.has(id))) throw new Error('unknown review finding')
    return rework.request(value)
  }
  const changeLifecycle = async (workflowRunId: string,
    event: 'PAUSE' | 'RESUME' | 'CANCEL' | 'APPROVE') => {
    const run = await repositories.workflowRuns.get(workflowRunId)
    if (!run) throw new Error(`unknown workflow run ${workflowRunId}`)
    const state = transitionWorkflow(run, { type: event })
    const timestamp = now()
    const updated: WorkflowRun = { ...run, ...state, updatedAt: timestamp,
      ...(state.status === 'CANCELLED' ? { cancelledAt: timestamp } : {}) }
    await repositories.workflowRuns.save(updated)
    const session = await repositories.workSessions.get(run.workSessionId)
    if (session) await repositories.workSessions.save({ ...session,
      status: sessionStatus(updated.status), updatedAt: timestamp,
      ...(updated.status === 'CANCELLED' ? { cancelledAt: timestamp } : {}) })
    return updated
  }
  const workCommands = createWorkSessionCommands({ idempotency: repositories.commandIdempotency,
    transaction, resolve: resolveWork, lifecycle: {
      pause: id => changeLifecycle(id, 'PAUSE'), resume: id => changeLifecycle(id, 'RESUME'),
      cancel: id => changeLifecycle(id, 'CANCEL') },
    switchRuntime: value => runtime.switchRuntime(value),
    approvePlan: value => changeLifecycle(value.workflowRunId, 'APPROVE'),
    createRework: value => createOwnedRework(value) })

  const agentCommands = createAgentSettingsCommands({ idempotency: repositories.commandIdempotency,
    transaction,
    runExternal: (name, value, operation) => runIdempotentExternalCommand({
      idempotency: repositories.commandIdempotency, transaction
    }, value.requestId, name, () => operation(value)),
    createAgent: async value => {
      const timestamp = now()
      const agent: AgentDefinition = { id: nextId(), projectId: String(value.scopeId),
        name: String(value.name), role: String(value.role), createdAt: timestamp, updatedAt: timestamp }
      if (!await repositories.projects.get(agent.projectId)) throw new Error('unknown project')
      await repositories.agentDefinitions.save(agent)
      return { ok: true, entityId: agent.id }
    },
    updateAgent: async value => {
      const agent = await repositories.agentDefinitions.get(String(value.agentId))
      if (!agent || agent.projectId !== value.scopeId) throw new Error('unknown agent')
      const patch = value.patch as JsonPatch
      const updated: AgentDefinition = { ...agent,
        ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
        ...(typeof patch.role === 'string' ? { role: patch.role } : {}), updatedAt: now() }
      await repositories.agentDefinitions.save(updated)
      return { ok: true, entityId: agent.id }
    },
    removeAgent: async value => {
      const agent = await repositories.agentDefinitions.get(String(value.agentId))
      if (!agent || agent.projectId !== value.scopeId) throw new Error('unknown agent')
      await repositories.agentDefinitions.save({ ...agent, archivedAt: now(), updatedAt: now() })
      return { ok: true, entityId: agent.id }
    },
    connectProvider: async value => { await input.support.connectProvider(value as never); return { ok: true } },
    refreshProvider: async value => { await input.support.refreshProvider(value as never); return { ok: true } },
    setProviderEnabled: async value => { await input.support.setProviderEnabled(value as never); return { ok: true } },
    probeProvider: async value => { await input.support.probeProvider(value as never); return { ok: true } },
    updateSettings: async value => { await input.support.updateSettings(value as never); return { ok: true } }
  })

  const workProjection = (value: Input) => workProjections.getWorkProjection(
    String(value.projectId), String(value.workSessionId), String(value.workflowRunId))
  const publishForWork = async (projectId: string, workSessionId: string) => {
    if (!input.publishWorkflow) return
    const session = await repositories.projections.getWorkSessionOwnedByProject(projectId, workSessionId)
    if (!session?.activeWorkflowRunId) return
    const workflow = await repositories.projections.getWorkflowOwnedByProject(
      projectId, session.activeWorkflowRunId)
    if (workflow) await input.publishWorkflow(workflow,
      await input.events.latestSequence(workflow.id))
  }
  const commandInput = (value: Input) => ({ requestId: String(value.requestId),
    ...(value.input as object) }) as { requestId: string; projectId: string; workSessionId: string }
  const switchRuntime = async (data: { requestId: string; projectId: string; workSessionId: string;
    target: RuntimeTarget; reason: string }) => {
    const candidates = await input.support.listRuntimeTargets(data.projectId, data.workSessionId)
    const candidate = candidates.find(item => item.selectable &&
      item.target.providerId === data.target.providerId && item.target.accountId === data.target.accountId &&
      item.target.modelId === data.target.modelId &&
      item.target.capabilities.structuredTools === data.target.capabilities.structuredTools)
    if (!candidate) throw new Error('runtime target is unavailable')
    return workCommands.switchRuntime({ ...data, target: candidate.target })
  }
  const ack = async (operation: Promise<unknown>, after?: () => Promise<void>) => {
    await operation
    await after?.()
    return { ok: true }
  }
  const handlers: Record<string, (value: Input) => Promise<unknown>> = {
    'project.list': () => projectProjections.listHomeProjection(),
    'project.get': async value => (await projectProjections.getProjectDetail(String(value.id))).project,
    'workSession.listByProject': async value => {
      const detail = await projectProjections.getProjectDetail(String(value.projectId))
      return detail.workSessions.status === 'AVAILABLE' ? detail.workSessions.value : []
    },
    'workSession.get': async value => {
      const session = await repositories.workSessions.get(String(value.id))
      if (!session) throw new Error('unknown work session')
      return session
    },
    'workSession.runtimeTargets': async value => {
      const projectId = String(value.projectId); const workSessionId = String(value.workSessionId)
      if (!await repositories.projections.getWorkSessionOwnedByProject(projectId, workSessionId)) {
        throw new ProjectionNotFoundError()
      }
      return input.support.listRuntimeTargets(projectId, workSessionId)
    },
    'workSession.create': async value => {
      const envelope = value as { requestId: string; input: { projectId: string; goal: string; title?: string } }
      const session = await runIdempotentCommand({ idempotency: repositories.commandIdempotency, transaction },
        envelope.requestId, 'workSession.create', async () => {
        if (!await repositories.projects.get(envelope.input.projectId)) throw new Error('unknown project')
        const timestamp = now(); const sessionId = nextId(); const workflowId = nextId()
        const session: WorkSession = { id: sessionId, projectId: envelope.input.projectId,
          title: envelope.input.title ?? envelope.input.goal, goal: envelope.input.goal,
          status: 'PLANNING', activeWorkflowRunId: workflowId, createdAt: timestamp, updatedAt: timestamp }
        const workflow: WorkflowRun = { id: workflowId, workSessionId: sessionId, status: 'RECEIVED',
          blockingGates: 0, createdAt: timestamp, updatedAt: timestamp }
        await repositories.workSessions.save(session); await repositories.workflowRuns.save(workflow)
        return session
      })
      await publishForWork(session.projectId, session.id)
      return session
    },
    'workSession.pause': value => { const data = commandInput(value); return ack(
      workCommands.pause(data), () => publishForWork(data.projectId, data.workSessionId)) },
    'workSession.resume': value => { const data = commandInput(value); return ack(
      workCommands.resume(data), () => publishForWork(data.projectId, data.workSessionId)) },
    'workSession.cancel': value => { const data = commandInput(value); return ack(
      workCommands.cancel(data), () => publishForWork(data.projectId, data.workSessionId)) },
    'workSession.switchRuntime': value => { const data = commandInput(value); return ack(
      switchRuntime(data as never), () => publishForWork(data.projectId, data.workSessionId)) },
    'workflow.get': async value => {
      const workflow = await repositories.workflowRuns.get(String(value.id))
      if (!workflow) throw new Error('unknown workflow run')
      return workflow
    },
    'workflow.conversation': workProjection, 'workflow.plan': workProjection,
    'workflow.tasks': workProjection, 'workflow.execution': workProjection,
    'workflow.changes': workProjection, 'workflow.review': workProjection,
    'workflow.runtimeHistory': workProjection,
    'workflow.bottomPanel': value => bottom.get(String(value.projectId), String(value.workflowRunId),
      typeof value.limit === 'number' ? value.limit : undefined),
    'workflow.approvePlan': value => { const data = commandInput(value); return ack(
      workCommands.approvePlan(data), () => publishForWork(data.projectId, data.workSessionId)) },
    'workflow.createRework': value => { const data = commandInput(value); return ack(
      workCommands.createRework(data as never), () => publishForWork(data.projectId, data.workSessionId)) },
    'agent.list': async () => {
      const project = (await repositories.projections.listProjects())[0]
      return settings.get(project?.id ?? 'global')
    },
    'agent.listByProject': value => settings.get(String(value.projectId)),
    'agent.get': async value => {
      const agent = await repositories.agentDefinitions.get(String(value.id))
      if (!agent) throw new Error('unknown agent')
      return settings.get(agent.projectId)
    },
    'agent.create': value => agentCommands.createAgent({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'agent.update': value => agentCommands.updateAgent({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'agent.remove': value => agentCommands.removeAgent({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'provider.listAccounts': () => input.support.listProviderAccounts(),
    'provider.connect': value => agentCommands.connectProvider({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'provider.refresh': value => agentCommands.refreshProvider({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'provider.setEnabled': value => agentCommands.setProviderEnabled({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'provider.probe': value => agentCommands.probeProvider({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'provider.quota': () => input.support.listQuotaSnapshots(),
    'usage.get': async value => {
      const projectId = String(value.projectId); const workSessionId = String(value.workSessionId)
      const workflowRunId = String(value.workflowRunId)
      const session = await repositories.projections.getWorkSessionOwnedByProject(projectId, workSessionId)
      const workflow = await repositories.projections.getWorkflowOwnedByProject(projectId, workflowRunId)
      if (!session || !workflow || workflow.workSessionId !== session.id) throw new ProjectionNotFoundError()
      const [totals, policy, agentRuns] = await Promise.all([input.usage.totals({ workflowRunId }),
        input.budgets.get(workflowRunId), repositories.projections.listAgentRunsByWorkflow(workflowRunId)])
      const budgetUsage = { costUsd: totals.costUsd, costKnown: totals.costKnown,
        inputTokens: totals.inputTokens, requests: totals.requests,
        concurrentAgents: agentRuns.filter(run => run.status === 'RUNNING').length,
        elapsedMs: Math.max(0, Date.parse(now()) - Date.parse(session.createdAt)) }
      return { projectId, workSessionId, workflowRunId, totals, policy,
        decision: evaluateBudget(policy, budgetUsage) }
    },
    'usage.updateBudget': async value => {
      const envelope = value as { requestId: string; input: { projectId: string; workSessionId: string;
        workflowRunId: string; policy: import('../../../shared/v2/contracts/usage').BudgetPolicy } }
      const owned = await repositories.projections.getWorkflowOwnedByProject(
        envelope.input.projectId, envelope.input.workflowRunId)
      if (!owned || owned.workSessionId !== envelope.input.workSessionId) throw new ProjectionNotFoundError()
      await runIdempotentCommand({ idempotency: repositories.commandIdempotency, transaction },
        envelope.requestId, 'usage.updateBudget', async () => {
          await input.budgets.save(envelope.input.workflowRunId, envelope.input.policy, now())
          return { ok: true }
        })
      return { ok: true }
    },
    'workspace.get': value => projectProjections.getProjectWorkspace(String(value.projectId)),
    'git.status': async value => available(await input.support.getGitStatus(String(value.projectId)), 'git status'),
    'skill.list': async value => available(await input.support.listSkillBindings(String(value.projectId)), 'skills'),
    'mcp.listServers': async value => available(await input.support.listMcpServers(String(value.projectId)), 'MCP servers'),
    'settings.get': value => settings.get(String(value.projectId)),
    'settings.update': value => agentCommands.updateSettings({ requestId: String(value.requestId), ...(value.input as object) } as never),
    'diagnostics.list': async value => available(await input.support.listDiagnostics(String(value.projectId),
      typeof value.workflowRunId === 'string' ? value.workflowRunId : undefined), 'diagnostics'),
    'remote.status': () => input.support.remoteStatus()
  }
  return { handlers: handlers as Readonly<Record<string, (value: unknown) => Promise<unknown>>> }
}
