import type { CommandIdempotencyPort } from '../ports/command-idempotency-port'
import { runIdempotentCommand } from './idempotent-command'

type Input = { requestId: string; scopeId: string; [key: string]: unknown }

export function createAgentSettingsCommands(deps: {
  idempotency: CommandIdempotencyPort
  transaction<T>(operation: () => Promise<T>): Promise<T>
  createAgent(input: Input): Promise<unknown>
  updateAgent(input: Input): Promise<unknown>
  removeAgent(input: Input): Promise<unknown>
  connectProvider(input: Input): Promise<unknown>
  refreshProvider(input: Input): Promise<unknown>
  setProviderEnabled(input: Input): Promise<unknown>
  probeProvider(input: Input): Promise<unknown>
  updateSettings(input: Input): Promise<unknown>
}) {
  const run = (name: string, input: Input, operation: (input: Input) => Promise<unknown>) =>
    runIdempotentCommand(deps, input.requestId, name, () => operation(input))
  return {
    createAgent: (input: Input) => run('agent.create', input, deps.createAgent),
    updateAgent: (input: Input) => run('agent.update', input, deps.updateAgent),
    removeAgent: (input: Input) => run('agent.remove', input, deps.removeAgent),
    connectProvider: (input: Input) => run('provider.connect', input, deps.connectProvider),
    refreshProvider: (input: Input) => run('provider.refresh', input, deps.refreshProvider),
    setProviderEnabled: (input: Input) => run('provider.setEnabled', input, deps.setProviderEnabled),
    probeProvider: (input: Input) => run('provider.probe', input, deps.probeProvider),
    updateSettings: (input: Input) => run('settings.update', input, deps.updateSettings)
  }
}
