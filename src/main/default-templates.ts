import type { Template } from '../shared/types'

export const DEFAULT_TEMPLATES: Template[] = [
  { id: 'bs', name: 'bs', command: 'bs', args: [], kind: 'native' },
  { id: 'opencode', name: 'opencode', command: 'opencode', args: [] },
  { id: 'claude', name: 'claude code', command: 'claude', args: [] },
  { id: 'aider', name: 'aider', command: 'aider', args: ['--auto-commits'] }
]
