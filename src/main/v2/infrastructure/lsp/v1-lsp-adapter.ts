import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LspPort } from '../../application/ports/lsp-port'
import type { LspDiagnostic } from '../../../../shared/v2/contracts/lsp'
import { LspDiagnosticSchema } from '../../../../shared/v2/schemas/extensions'

interface LegacyDiagnostic {
  filePath: string
  line: number
  column: number
  message: string
  severity: number
}

interface LegacyLspManagerEdge {
  diagnosticsFor(filePath: string, text: string): Promise<LegacyDiagnostic[]>
}

function severity(value: number): LspDiagnostic['severity'] {
  if (value === 1) return 'ERROR'
  if (value === 2) return 'WARNING'
  return 'INFO'
}

export function mapLegacyDiagnostic(input: LegacyDiagnostic): LspDiagnostic {
  const line = Math.max(0, input.line - 1)
  const character = Math.max(0, input.column - 1)
  return LspDiagnosticSchema.parse({
    uri: input.filePath,
    range: {
      start: { line, character },
      end: { line, character: character + 1 }
    },
    severity: severity(input.severity),
    message: input.message
  }) as LspDiagnostic
}

function resolveDocumentPath(uri: string): string {
  return path.resolve(uri.startsWith('file:') ? fileURLToPath(uri) : uri)
}

function isWithin(candidate: string, workspace: string): boolean {
  const relative = path.relative(workspace, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export class V1LspAdapter implements LspPort {
  constructor(private readonly legacy: LegacyLspManagerEdge) {}

  async diagnostics(input: {
    projectId: string
    workspacePath: string
    uri: string
    text: string
  }): Promise<readonly LspDiagnostic[]> {
    const workspacePath = path.resolve(input.workspacePath)
    const filePath = resolveDocumentPath(input.uri)
    if (!isWithin(filePath, workspacePath)) throw new Error('LSP document is outside workspace scope')
    const diagnostics = await this.legacy.diagnosticsFor(filePath, input.text)
    return diagnostics.map(mapLegacyDiagnostic)
  }
}
