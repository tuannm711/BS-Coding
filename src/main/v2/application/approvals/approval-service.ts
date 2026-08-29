export interface ApprovalRequest {
  type: 'APPROVAL_REQUESTED'
  callId: string
  toolName: string
  correlationId: string
}

export function createApprovalService(deps: { append(event: ApprovalRequest): Promise<void> }) {
  return {
    async request(input: Omit<ApprovalRequest, 'type'>): Promise<ApprovalRequest> {
      const request: ApprovalRequest = { type: 'APPROVAL_REQUESTED', ...input }
      await deps.append(request)
      return request
    }
  }
}
