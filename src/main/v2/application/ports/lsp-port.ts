import type { LspDiagnostic } from '../../../../shared/v2/contracts/lsp'

export interface LspDocumentInput {
  projectId: string
  workspacePath: string
  uri: string
  text: string
}

export interface LspPort {
  diagnostics(input: LspDocumentInput, signal?: AbortSignal): Promise<readonly LspDiagnostic[]>
}
