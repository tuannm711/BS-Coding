import { describe, expect, it } from 'vitest'
import { mapLegacyDiagnostic, V1LspAdapter } from '../../../src/main/v2/infrastructure/lsp/v1-lsp-adapter'

describe('V1 LSP adapter', () => {
  it('maps legacy diagnostics to evidence-only canonical data', () => {
    const diagnostic = mapLegacyDiagnostic({
      filePath: 'C:/project/src/a.ts', line: 2, column: 3,
      message: 'Unknown symbol', severity: 1
    })

    expect(diagnostic).toEqual({
      uri: 'C:/project/src/a.ts',
      range: { start: { line: 1, character: 2 }, end: { line: 1, character: 3 } },
      severity: 'ERROR', message: 'Unknown symbol'
    })
    expect(diagnostic).not.toHaveProperty('taskStatus')
  })

  it('maps unknown diagnostic severities conservatively to info', () => {
    expect(mapLegacyDiagnostic({ filePath: 'a.ts', line: 0, column: -1,
      message: 'hint', severity: 99 })).toMatchObject({
      range: { start: { line: 0, character: 0 } }, severity: 'INFO'
    })
  })

  it('scopes diagnostics to the declared workspace and does not mutate workflow state', async () => {
    const calls: Array<{ filePath: string; text: string }> = []
    const adapter = new V1LspAdapter({
      diagnosticsFor: async (filePath, text) => {
        calls.push({ filePath, text })
        return [{ filePath, line: 1, column: 1, message: 'x', severity: 2 }]
      }
    })

    const diagnostics = await adapter.diagnostics({
      projectId: 'project-1', workspacePath: 'C:/project',
      uri: 'C:/project/src/a.ts', text: 'const x = y'
    })

    expect(calls).toEqual([{ filePath: 'C:\\project\\src\\a.ts', text: 'const x = y' }])
    expect(diagnostics[0]).toMatchObject({ severity: 'WARNING', message: 'x' })
    expect(diagnostics[0]).not.toHaveProperty('workflowRunId')
    await expect(adapter.diagnostics({
      projectId: 'project-1', workspacePath: 'C:/project',
      uri: 'C:/other/secret.ts', text: ''
    })).rejects.toThrow(/workspace/i)
  })
})
