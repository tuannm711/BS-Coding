import { z } from 'zod'
import type {
  AgentSettingsProjection, BottomPanelProjection, HomeProjection, ProjectDetailProjection,
  ProjectSummary, ProjectWorkspaceProjection, WorkProjection, WorkSessionSummary
} from '../contracts/ui-projections'

const id = z.string().min(1)
const timestamp = z.iso.datetime({ offset: true })
const revision = z.number().int().nonnegative()

const section = <T extends z.ZodTypeAny>(value: T) => z.discriminatedUnion('status', [
  z.object({ status: z.literal('AVAILABLE'), value }).strict(),
  z.object({ status: z.literal('EMPTY') }).strict(),
  z.object({ status: z.literal('UNAVAILABLE'), errorCode: id }).strict()
])

export const ProjectSummarySchema = z.object({
  id, name: id, repoPath: id, defaultBranch: id,
  activeWorkCount: z.number().int().nonnegative(), updatedAt: timestamp, revision
}).strict() satisfies z.ZodType<ProjectSummary>

export const WorkSessionSummarySchema = z.object({
  id, projectId: id, title: z.string(), goal: z.string(),
  status: z.enum(['PLANNING', 'EXECUTING', 'PAUSED', 'REVIEW', 'REWORK', 'VERIFYING',
    'COMPLETED', 'CANCELLED', 'FAILED', 'BLOCKED']),
  completedTaskCount: z.number().int().nonnegative(),
  totalTaskCount: z.number().int().nonnegative(),
  activeAgentCount: z.number().int().nonnegative(),
  attentionCount: z.number().int().nonnegative(), updatedAt: timestamp, revision
}).strict() satisfies z.ZodType<WorkSessionSummary>

const ProviderAccountSchema = z.object({
  id, providerId: id, enabled: z.boolean(),
  status: z.enum(['HEALTHY', 'COOLDOWN', 'EXPIRED', 'ERROR', 'UNKNOWN'])
}).strict()
export const HomeProjectionSchema = z.object({
  revision, projects: z.array(ProjectSummarySchema),
  activeWorkSessions: z.array(WorkSessionSummarySchema),
  needsAttention: z.array(z.object({
    id, projectId: id, workSessionId: id,
    kind: z.enum(['BLOCKED', 'FAILED', 'REVIEW']), title: z.string()
  }).strict()),
  providerAccounts: section(z.array(ProviderAccountSchema))
}).strict() satisfies z.ZodType<HomeProjection>

const WorkspaceSummarySchema = z.object({
  id, path: id, mode: z.enum(['READ_ONLY', 'ISOLATED_WRITE']),
  fileCount: z.number().int().nonnegative()
}).strict()
const GitSummarySchema = z.object({ branch: id, dirty: z.boolean(), changedFiles: z.array(id) }).strict()
const AgentSummarySchema = z.object({
  id, name: id, role: id, status: z.enum(['READY', 'RUNNING', 'DISABLED', 'ERROR']),
  currentVersionId: id.optional()
}).strict()
const SkillBindingSummarySchema = z.object({
  id, name: id, version: id, source: z.enum(['BUILTIN', 'MARKETPLACE', 'USER', 'PROJECT']),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/), enabled: z.boolean()
}).strict()
const McpServerSummarySchema = z.object({
  id, name: id, status: z.enum(['CONNECTED', 'ERROR']), toolNames: z.array(id)
}).strict()

export const ProjectDetailProjectionSchema = z.object({
  project: ProjectSummarySchema, revision,
  workSessions: section(z.array(WorkSessionSummarySchema)),
  workspace: section(WorkspaceSummarySchema), git: section(GitSummarySchema),
  agents: section(z.array(AgentSummarySchema)), skills: section(z.array(SkillBindingSummarySchema)),
  mcp: section(z.array(McpServerSummarySchema))
}).strict() satisfies z.ZodType<ProjectDetailProjection>

export const ProjectWorkspaceProjectionSchema = z.object({
  projectId: id, revision, workspace: section(WorkspaceSummarySchema), git: section(GitSummarySchema)
}).strict() satisfies z.ZodType<ProjectWorkspaceProjection>

const ConversationItemSchema = z.object({
  id, kind: z.enum(['MESSAGE', 'RUNTIME_CHANGED', 'TOOL', 'SYSTEM']), occurredAt: timestamp,
  title: id, body: z.string().optional(), artifactRefs: z.array(id)
}).strict()
const PlanSchema = z.object({
  id, status: z.enum(['DRAFT', 'WAITING_APPROVAL', 'APPROVED']),
  goal: z.string(), acceptanceCriteria: z.array(z.string())
}).strict()
const TaskSchema = z.object({
  id, title: z.string(), status: z.enum(['QUEUED', 'READY', 'RUNNING', 'COMPLETED',
    'FAILED', 'BLOCKED', 'CANCELLED']), dependsOn: z.array(id), assignedAgentId: id.optional()
}).strict()
const ExecutionSchema = z.object({
  id, taskId: id, agentId: id.optional(), status: id,
  startedAt: timestamp.optional(), completedAt: timestamp.optional()
}).strict()
const ChangeSchema = z.object({
  path: id, additions: z.number().int().nonnegative(), deletions: z.number().int().nonnegative(),
  artifactId: id.optional()
}).strict()
const ReviewSchema = z.object({
  reviews: z.array(z.object({
    id, decision: z.enum(['PASS', 'PASS_WITH_SUGGESTIONS', 'FAIL', 'BLOCKED']),
    reviewerAgentVersionId: id
  }).strict()),
  gates: z.array(z.object({
    id, status: z.enum(['PENDING', 'RUNNING', 'PASS', 'FAIL', 'BLOCKED']), blocking: z.boolean()
  }).strict()),
  findings: z.array(z.object({
    id, severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    status: z.enum(['OPEN', 'ACCEPTED', 'FIXED', 'DISMISSED']), blocking: z.boolean(),
    description: z.string(), linkedReworkTaskId: id.optional()
  }).strict())
}).strict()
export const RuntimeEpochSummarySchema = z.object({
  id, status: z.enum(['STARTING', 'ACTIVE', 'CLOSING', 'CLOSED']), providerId: id,
  accountId: id, modelId: id, startedAt: timestamp, endedAt: timestamp.optional()
}).strict()

export const WorkProjectionSchema = z.object({
  projectId: id, workSessionId: id, workflowRunId: id, revision,
  conversation: section(z.array(ConversationItemSchema)), plan: section(PlanSchema),
  tasks: section(z.array(TaskSchema)), execution: section(z.array(ExecutionSchema)),
  changes: section(z.array(ChangeSchema)), review: section(ReviewSchema),
  runtimeHistory: section(z.array(RuntimeEpochSummarySchema))
}).strict() satisfies z.ZodType<WorkProjection>

const CredentialStateSchema = z.object({ configured: z.boolean() }).strict()
export const AgentSettingsProjectionSchema = z.object({
  projectId: id, revision, agents: z.array(AgentSummarySchema),
  providerAccounts: z.array(ProviderAccountSchema),
  globalSettings: z.object({
    providerCredentials: z.record(z.string(), CredentialStateSchema)
  }).strict()
}).strict() satisfies z.ZodType<AgentSettingsProjection>

const TerminalSchema = z.object({
  id, title: id, status: z.enum(['RUNNING', 'EXITED', 'ERROR'])
}).strict()
const TestRunSchema = z.object({
  id, status: z.enum(['PASS', 'FAIL', 'RUNNING']), artifactId: id.optional()
}).strict()
const ProblemSchema = z.object({
  id, kind: z.enum(['LSP_DIAGNOSTIC', 'REVIEW_FINDING']),
  severity: z.enum(['INFO', 'WARNING', 'ERROR']), message: z.string(), evidenceRefs: z.array(id)
}).strict()
const LogSchema = z.object({
  id, occurredAt: timestamp, level: z.enum(['INFO', 'WARNING', 'ERROR']), message: z.string()
}).strict()
const OutputSchema = z.object({ id, preview: z.string(), artifactId: id.optional() }).strict()

export const BottomPanelProjectionSchema = z.object({
  projectId: id, workflowRunId: id, revision,
  terminals: section(z.array(TerminalSchema)), tests: section(z.array(TestRunSchema)),
  problems: section(z.array(ProblemSchema)), logs: section(z.array(LogSchema)),
  output: section(z.array(OutputSchema))
}).strict() satisfies z.ZodType<BottomPanelProjection>
