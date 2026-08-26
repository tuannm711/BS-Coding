import { z } from 'zod'
import type { ToolDefinition, ToolRunResult } from './types'

export interface DelegateWorker {
  name: string
  coordinating: boolean
}

export interface DelegateOptions {
  /** The agents this coordinator may assign to. The caller is already excluded. */
  listWorkers: () => DelegateWorker[]
  run: (name: string, task: string) => Promise<{ output: string } | { error: string }>
}

const schema = z.object({
  agent: z.string().describe('Name of the agent to assign this task to.'),
  task: z.string().describe(
    'The task, written to stand on its own. The agent sees this text and its own ' +
    'history, and nothing you know.'
  )
})

// The packet out is this tool's input and the packet back is its output; there
// is no separate transport. The tool never learns who is calling it — the
// caller is excluded from listWorkers, so delegating to yourself is impossible
// rather than checked.
export function createDelegateTool(opts: DelegateOptions): ToolDefinition {
  return {
    name: 'delegate',
    description:
      'Assign a task to another agent and wait for its result. The agent works in its own ' +
      'conversation with its own model, so the task must stand alone: it sees only this text ' +
      'and its own history. Returns what the agent reported.',
    schema,
    async run(input): Promise<ToolRunResult> {
      const { agent, task } = input as { agent?: unknown; task?: unknown }
      const name = typeof agent === 'string' ? agent.trim() : ''
      const text = typeof task === 'string' ? task.trim() : ''
      const workers = opts.listWorkers()
      if (!text) return { error: '[bs] delegate needs a task. An empty one tells the agent nothing.' }
      const target = workers.find(worker => worker.name === name)
      if (!target) {
        const names = workers.map(worker => worker.name).join(', ')
        return { error: `[bs] No agent named "${name}". Available: ${names || 'none'}` }
      }
      // One level deep. Two coordinators assigning to each other would loop.
      if (target.coordinating) {
        return { error: `[bs] ${name} is coordinating and cannot be assigned work.` }
      }
      const result = await opts.run(name, text)
      // A worker that fails is something to act on, not a crash of this turn.
      return 'error' in result ? { error: result.error } : { output: result.output }
    }
  }
}
