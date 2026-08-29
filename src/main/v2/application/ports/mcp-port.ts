import type { JsonObject, McpServerDescriptor, McpToolDescriptor } from '../../../../shared/v2/contracts/mcp'

export interface McpPort {
  listServers(): Promise<readonly McpServerDescriptor[]>
  listTools(): Promise<readonly McpToolDescriptor[]>
  callTool(serverId: string, toolName: string, input: JsonObject, signal?: AbortSignal): Promise<unknown>
}
