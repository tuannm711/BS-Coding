export interface DiagnosticCorrelation {
  projectId: string
  workSessionId?: string
  workflowRunId?: string
  taskRunId?: string
  agentRunId?: string
  runtimeEpochId?: string
  correlationId: string
}

export interface DiagnosticEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR'
  code: string
  message: string
  correlation: DiagnosticCorrelation
}
