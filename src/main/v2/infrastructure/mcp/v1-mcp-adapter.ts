import type { McpPort } from '../../application/ports/mcp-port'
import type { JsonObject, McpServerDescriptor, McpToolDescriptor } from '../../../../shared/v2/contracts/mcp'
import { McpServerDescriptorSchema, McpToolDescriptorSchema } from '../../../../shared/v2/schemas/extensions'

interface LegacyMcpTool {
  name: string
  description?: string
  schema?: Record<string, unknown>
  run(input: unknown): Promise<unknown>
}

interface LegacyMcpManagerEdge {
  status(): Array<{ name: string; status: 'connected' | 'error'; error?: string; tools: string[] }>
  getTools(): Map<string, LegacyMcpTool>
}

function fullName(serverId: string, toolName: string): string {
  return `mcp__${serverId}__${toolName}`
}

export class V1McpAdapter implements McpPort {
  constructor(private readonly legacy: LegacyMcpManagerEdge) {}

  async listServers(): Promise<readonly McpServerDescriptor[]> {
    return this.legacy.status().map(status => McpServerDescriptorSchema.parse({
      id: status.name,
      name: status.name,
      transport: 'STDIO',
      status: status.status === 'connected' ? 'CONNECTED' : 'ERROR',
      environmentRefs: [],
      toolNames: status.tools,
      ...(status.error === undefined ? {} : { error: status.error })
    }) as McpServerDescriptor)
  }

  async listTools(): Promise<readonly McpToolDescriptor[]> {
    const descriptors: McpToolDescriptor[] = []
    for (const server of await this.listServers()) {
      for (const toolName of server.toolNames) {
        const legacyTool = this.legacy.getTools().get(fullName(server.id, toolName))
        if (!legacyTool) throw new Error(`MCP tool ${server.id}/${toolName} not found`)
        descriptors.push(McpToolDescriptorSchema.parse({
          serverId: server.id,
          toolName,
          definition: {
            name: legacyTool.name,
            description: legacyTool.description ?? `MCP tool ${toolName} from server ${server.name}`,
            permissionCategory: `mcp.${server.id}`,
            sideEffectLevel: 'EXTERNAL_WRITE',
            supportsCancellation: false,
            outputPolicy: 'ARTIFACT',
            workspaceRequirement: 'PROJECT'
          },
          inputSchema: legacyTool.schema ?? { type: 'object', properties: {} }
        }) as McpToolDescriptor)
      }
    }
    return descriptors
  }

  async callTool(serverId: string, toolName: string, input: JsonObject): Promise<unknown> {
    const tool = this.legacy.getTools().get(fullName(serverId, toolName))
    if (!tool) throw new Error(`MCP tool ${serverId}/${toolName} not found`)
    return tool.run(input)
  }
}
