import { z } from 'zod'
import { ToolDefinitionSchema } from './tool-call'

const id = z.string().min(1)
const skillSource = z.enum(['BUILTIN', 'MARKETPLACE', 'USER', 'PROJECT'])

export const SkillDefinitionSchema = z.object({
  id,
  name: id,
  version: id,
  source: skillSource,
  description: z.string(),
  content: z.string(),
  requiredToolNames: z.array(id),
  requiredMcpCapabilities: z.array(id)
}).strict()

export const SkillSnapshotSchema = z.object({
  id,
  name: id,
  version: id,
  source: skillSource,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  contentArtifactId: id
}).strict()

export const McpServerDescriptorSchema = z.object({
  id,
  name: id,
  transport: z.enum(['STDIO', 'HTTP']),
  status: z.enum(['CONNECTED', 'ERROR']),
  environmentRefs: z.array(id),
  toolNames: z.array(id),
  error: z.string().optional()
}).strict()

export const McpToolDescriptorSchema = z.object({
  serverId: id,
  toolName: id,
  definition: ToolDefinitionSchema.strict(),
  inputSchema: z.record(z.string(), z.json())
}).strict()

const position = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative()
}).strict()

export const LspDiagnosticSchema = z.object({
  uri: id,
  range: z.object({ start: position, end: position }).strict(),
  severity: z.enum(['ERROR', 'WARNING', 'INFO']),
  message: id,
  source: id.optional(),
  code: id.optional()
}).strict()
