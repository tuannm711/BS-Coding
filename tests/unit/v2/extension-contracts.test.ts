import { describe, expect, it } from 'vitest'
import {
  LspDiagnosticSchema,
  McpServerDescriptorSchema,
  McpToolDescriptorSchema,
  SkillSnapshotSchema
} from '../../../src/shared/v2/schemas/extensions'

describe('skill, MCP and LSP contracts', () => {
  it('accepts reproducible skill snapshots and rejects malformed content hashes', () => {
    const snapshot = {
      id: 'planning',
      name: 'planning',
      version: '1.4.0',
      source: 'MARKETPLACE',
      contentHash: 'a'.repeat(64),
      contentArtifactId: 'artifact-skill-planning'
    }

    expect(SkillSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(SkillSnapshotSchema.safeParse({ ...snapshot, contentHash: 'not-sha256' }).success)
      .toBe(false)
  })

  it('keeps MCP descriptors serializable and rejects embedded execution functions', () => {
    const server = {
      id: 'server-github',
      name: 'github',
      transport: 'STDIO',
      status: 'CONNECTED',
      environmentRefs: ['vault:mcp/github/token'],
      toolNames: ['query']
    }
    const tool = {
      serverId: server.id,
      toolName: 'query',
      definition: {
        name: 'mcp__github__query',
        description: 'Query GitHub',
        permissionCategory: 'mcp.github',
        sideEffectLevel: 'NONE',
        supportsCancellation: true,
        outputPolicy: 'ARTIFACT',
        workspaceRequirement: 'PROJECT'
      },
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } }
    }

    expect(McpServerDescriptorSchema.parse(server)).toEqual(server)
    expect(McpToolDescriptorSchema.parse(tool)).toEqual(tool)
    expect(McpToolDescriptorSchema.safeParse({ ...tool, execute: () => 'bypass' }).success)
      .toBe(false)
  })

  it('keeps LSP diagnostics evidence-only without workflow state mutation', () => {
    const diagnostic = {
      uri: 'file:///project/src/a.ts',
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 5 }
      },
      severity: 'ERROR',
      message: 'Unknown symbol',
      source: 'typescript'
    }

    expect(LspDiagnosticSchema.parse(diagnostic)).toEqual(diagnostic)
    expect(LspDiagnosticSchema.safeParse({ ...diagnostic, taskStatus: 'FAILED' }).success)
      .toBe(false)
  })
})
