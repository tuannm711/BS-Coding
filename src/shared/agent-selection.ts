export function resolveActiveAgentId(
  agents: ReadonlyArray<{ id: string; name: string }>,
  preferredId: string | null
): string | null {
  if (preferredId && agents.some(agent => agent.id === preferredId)) return preferredId
  return agents.find(agent => agent.name === 'bs')?.id ?? agents[0]?.id ?? null
}
