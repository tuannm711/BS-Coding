export interface LspPosition {
  line: number
  character: number
}

export interface LspDiagnostic {
  uri: string
  range: {
    start: LspPosition
    end: LspPosition
  }
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  source?: string
  code?: string
}
