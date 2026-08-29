import type { Permission } from '../../../../shared/v2/contracts/tools'

export const ORCHESTRATOR_DENIED_TOOLS = Object.freeze([
  'write', 'edit', 'apply_patch', 'bash', 'revert', 'spawn_worker'
] as const)

const denied = new Set<string>(ORCHESTRATOR_DENIED_TOOLS)
const allowed = new Set(['read', 'search', 'list_files', 'manage_plan', 'manage_tasks', 'assign_task'])

export interface WorkflowProposal {
  type: string
  payload: unknown
}

export function createOrchestratorPolicy(deps: {
  proposeWorkflowCommand(command: WorkflowProposal): Promise<unknown>
}) {
  return {
    permissionFor(toolName: string): Permission {
      return denied.has(toolName) || !allowed.has(toolName) ? 'DENY' : 'ALLOW'
    },
    propose(command: WorkflowProposal): Promise<unknown> {
      return deps.proposeWorkflowCommand(structuredClone(command))
    }
  }
}
