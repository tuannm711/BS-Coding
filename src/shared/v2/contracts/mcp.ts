import type { ToolDefinition } from './tools'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export interface McpServerDescriptor {
  id: string
  name: string
  transport: 'STDIO' | 'HTTP'
  status: 'CONNECTED' | 'ERROR'
  environmentRefs: readonly string[]
  toolNames: readonly string[]
  error?: string
}

export interface McpToolDescriptor {
  serverId: string
  toolName: string
  definition: ToolDefinition
  inputSchema: JsonObject
}
