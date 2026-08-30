import { z } from 'zod'
import { P15_IPC, type P15PublicApiKey } from '../contracts/p15-backend-ipc'
import {
  AgentSettingsProjectionSchema, BottomPanelProjectionSchema, HomeProjectionSchema,
  AgentSummarySchema, GitSummarySchema, McpServerSummarySchema, ProblemSummarySchema,
  ProjectSummarySchema, ProjectWorkspaceProjectionSchema, SkillBindingSummarySchema,
  WorkProjectionSchema, WorkSessionSummarySchema, WorkspaceSummarySchema
} from './ui-projections'
import { ProviderAccountSummarySchema, WorkflowProjectionEventSchema, WorkflowRunSchema,
  WorkSessionSchema } from './ipc'
import { RuntimeTargetCandidateSummarySchema } from './provider'

const id = z.string().min(1)
const empty = z.object({}).strict()
const byId = z.object({ id }).strict()
const byProject = z.object({ projectId: id }).strict()
const byWork = z.object({ projectId: id, workSessionId: id, workflowRunId: id }).strict()
const envelope = <T extends z.ZodTypeAny>(input: T) => z.object({ requestId: id, input }).strict()
const scope = z.object({ scopeId: id }).strict()
const workScope = z.object({ projectId: id, workSessionId: id }).strict()
const ack = z.object({ ok: z.boolean(), entityId: id.optional(), status: z.string().optional() }).strict()
const runtimeTarget = z.object({ providerId: id, accountId: id, modelId: id,
  capabilities: z.object({ structuredTools: z.enum(['VERIFIED','DEGRADED','UNSUPPORTED','UNKNOWN']) }).strict() }).strict()

type Entry = { request?: z.ZodTypeAny; response?: z.ZodTypeAny; event?: z.ZodTypeAny }
const entries = {
  'project.list': { request: empty, response: HomeProjectionSchema },
  'project.get': { request: byId, response: ProjectSummarySchema },
  'workSession.listByProject': { request: byProject, response: z.array(WorkSessionSummarySchema) },
  'workSession.get': { request: byId, response: WorkSessionSchema },
  'workSession.runtimeTargets': { request: workScope, response: z.array(RuntimeTargetCandidateSummarySchema) },
  'workSession.create': { request: envelope(z.object({ projectId: id, goal: id, title: id.optional() }).strict()), response: WorkSessionSchema },
  'workSession.pause': { request: envelope(workScope), response: ack },
  'workSession.resume': { request: envelope(workScope), response: ack },
  'workSession.cancel': { request: envelope(workScope), response: ack },
  'workSession.switchRuntime': { request: envelope(workScope.extend({ target: runtimeTarget, reason: id })), response: ack },
  'workflow.get': { request: byId, response: WorkflowRunSchema },
  'workflow.conversation': { request: byWork, response: WorkProjectionSchema },
  'workflow.plan': { request: byWork, response: WorkProjectionSchema },
  'workflow.tasks': { request: byWork, response: WorkProjectionSchema },
  'workflow.execution': { request: byWork, response: WorkProjectionSchema },
  'workflow.changes': { request: byWork, response: WorkProjectionSchema },
  'workflow.review': { request: byWork, response: WorkProjectionSchema },
  'workflow.runtimeHistory': { request: byWork, response: WorkProjectionSchema },
  'workflow.bottomPanel': { request: byWork.extend({ limit: z.number().int().positive().max(200).optional() }), response: BottomPanelProjectionSchema },
  'workflow.approvePlan': { request: envelope(workScope), response: ack },
  'workflow.createRework': { request: envelope(workScope.extend({ findingIds: z.array(id).min(1), title: id })), response: ack },
  'workflow.projection': { event: WorkflowProjectionEventSchema },
  'agent.list': { request: empty, response: AgentSettingsProjectionSchema },
  'agent.listByProject': { request: byProject, response: AgentSettingsProjectionSchema },
  'agent.get': { request: byId, response: AgentSettingsProjectionSchema },
  'agent.create': { request: envelope(scope.extend({ name: id, role: id })), response: ack },
  'agent.update': { request: envelope(scope.extend({ agentId: id, patch: z.record(z.string(), z.json()) })), response: ack },
  'agent.remove': { request: envelope(scope.extend({ agentId: id })), response: ack },
  'provider.listAccounts': { request: empty, response: z.array(ProviderAccountSummarySchema) },
  'provider.connect': { request: envelope(scope.extend({ providerId: id, apiKey: id })), response: ack },
  'provider.refresh': { request: envelope(scope.extend({ providerId: id })), response: ack },
  'provider.setEnabled': { request: envelope(scope.extend({ accountId: id, enabled: z.boolean() })), response: ack },
  'provider.probe': { request: envelope(scope.extend({ providerId: id })), response: ack },
  'workspace.get': { request: byProject, response: ProjectWorkspaceProjectionSchema },
  'git.status': { request: byProject, response: GitSummarySchema },
  'skill.list': { request: byProject, response: z.array(SkillBindingSummarySchema) },
  'mcp.listServers': { request: byProject, response: z.array(McpServerSummarySchema) },
  'settings.get': { request: byProject, response: AgentSettingsProjectionSchema },
  'settings.update': { request: envelope(scope.extend({ patch: z.record(z.string(), z.json()) })), response: ack },
  'diagnostics.list': { request: byProject.extend({ workflowRunId: id.optional() }), response: z.array(ProblemSummarySchema) },
  'remote.status': { request: empty, response: z.object({ enabled: z.boolean(), status: z.string() }).strict() }
} as const satisfies Record<P15PublicApiKey, Entry>
export const P15PublicIpcSchemas = Object.freeze(entries)
export const P15_PUBLIC_API_KEYS = Object.freeze(Object.keys(P15_IPC) as P15PublicApiKey[])
