export type AgentRole = 'COORDINATOR' | 'SPECIALIST' | 'WORKER' | 'REVIEWER'

export interface DefaultAgentProfile {
  readonly name: string
  readonly role: AgentRole
  readonly responsibility: string
}

const profile = (name: string, role: AgentRole, responsibility: string): DefaultAgentProfile =>
  Object.freeze({ name, role, responsibility })

export const DEFAULT_AGENT_PROFILES: readonly DefaultAgentProfile[] = Object.freeze([
  profile('Orchestrator', 'COORDINATOR', 'Plan coordination, assignments, dependencies and reviews'),
  profile('Architect', 'SPECIALIST', 'Architecture, interfaces and dependency design'),
  profile('Backend Developer', 'WORKER', 'Backend, data and API implementation'),
  profile('Frontend Developer', 'WORKER', 'UI and client implementation'),
  profile('Code Reviewer', 'REVIEWER', 'Correctness, maintainability and architecture review'),
  profile('Security Reviewer', 'REVIEWER', 'OWASP, authorization, secrets and vulnerability review'),
  profile('QA / Tester', 'REVIEWER', 'Test planning, regression and acceptance verification'),
  profile('Integration Agent', 'SPECIALIST', 'Integrate task outputs, resolve conflicts and run gates')
])
