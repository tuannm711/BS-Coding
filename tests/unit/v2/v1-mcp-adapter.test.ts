import { describe, expect, it, vi } from 'vitest'
import { V1McpAdapter } from '../../../src/main/v2/infrastructure/mcp/v1-mcp-adapter'

describe('V1 MCP adapter', () => {
  it('normalizes tool metadata without executing the legacy binding', async () => {
    const run = vi.fn(async () => ({ output: 'ok' }))
    const adapter = new V1McpAdapter({
      status: () => [{ name: 'github', status: 'connected', tools: ['query'] }],
      getTools: () => new Map([['mcp__github__query', {
        name: 'mcp__github__query', description: 'Query GitHub',
        schema: { type: 'object', properties: { q: { type: 'string' } } }, run
      }]])
    })

    const tools = await adapter.listTools()

    expect(tools).toEqual([{
      serverId: 'github', toolName: 'query',
      definition: { name: 'mcp__github__query', description: 'Query GitHub',
        permissionCategory: 'mcp.github', sideEffectLevel: 'EXTERNAL_WRITE',
        supportsCancellation: false, outputPolicy: 'ARTIFACT', workspaceRequirement: 'PROJECT' },
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
    }])
    expect(run).not.toHaveBeenCalled()
    expect(JSON.stringify(tools)).not.toContain('run')
  })

  it('invokes a live legacy binding only through the explicit call port', async () => {
    const run = vi.fn(async (input: unknown) => ({ output: input }))
    const adapter = new V1McpAdapter({
      status: () => [{ name: 'github', status: 'connected', tools: ['query'] }],
      getTools: () => new Map([['mcp__github__query', {
        name: 'mcp__github__query', description: 'Query', schema: { type: 'object' }, run
      }]])
    })

    await expect(adapter.callTool('github', 'query', { q: 'repo' }))
      .resolves.toEqual({ output: { q: 'repo' } })
    expect(run).toHaveBeenCalledOnce()
    await expect(adapter.callTool('other', 'query', {})).rejects.toThrow(/registered/i)
  })

  it('maps server errors without exposing environment values', async () => {
    const adapter = new V1McpAdapter({
      status: () => [{ name: 'github', status: 'error', error: 'offline', tools: [] }],
      getTools: () => new Map()
    })

    await expect(adapter.listServers()).resolves.toEqual([{
      id: 'github', name: 'github', transport: 'STDIO', status: 'ERROR',
      environmentRefs: [], toolNames: [], error: 'offline'
    }])
  })

  it('refuses hidden bindings and malformed input before legacy execution', async () => {
    const run = vi.fn(async () => ({ output: 'bypass' }))
    const adapter = new V1McpAdapter({
      status: () => [{ name: 'github', status: 'connected', tools: ['query'] }],
      getTools: () => new Map([
        ['mcp__github__query', { name: 'mcp__github__query', description: 'Query',
          schema: { type: 'object' }, run: async () => ({ output: 'ok' }) }],
        ['mcp__github__hidden', { name: 'mcp__github__hidden', description: 'Hidden',
          schema: { type: 'object' }, run }]
      ])
    })

    await expect(adapter.callTool('github', 'hidden', {})).rejects.toThrow(/registered/i)
    await expect(adapter.callTool('github', 'query', [] as never)).rejects.toThrow(/JSON object/i)
    expect(run).not.toHaveBeenCalled()
  })
})
