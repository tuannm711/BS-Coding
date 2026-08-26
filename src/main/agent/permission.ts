import type { PermissionRule } from './config'
import type { AgentMode } from '../../shared/types'

export type PermissionDecision = 'allow' | 'ask' | 'deny'

// Plan mode mirrors opencode: read-only. Deny every write tool, ask for bash.
export const PLAN_RULES: Record<string, PermissionRule> = {
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  webfetch: 'allow',
  websearch: 'allow',
  skill: 'allow',
  question: 'allow',
  bash: 'ask',
  write: 'deny',
  edit: 'deny',
  'apply-patch': 'deny',
  revert: 'deny',
  git: 'deny',
  todowrite: 'deny',
  task: 'deny',
  'browser_*': 'ask'
}

// Bash is the leak: an LLM denied write/edit will rewrite files via sed -i,
// echo > file, or node -e with fs.writeFileSync. In plan mode these must
// be denied outright, not merely asked about.
const WRITE_REDIRECT = /(^|[\s;&|]*)\d*(?<!=)>{1,2}(?!\s*&)(?!\s*\/dev\/)/m
const WRITE_TOKENS = /\b(?:sed\s+-i|perl\s+-i|tee|dd|mv|rm|cp|mkdir|touch|chmod|chown|install|truncate|mkfifo|unlink|rmdir|apply-patch)\b/
const WRITE_APIS = /\b(?:fs\.(?:writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rm|rmSync|rename|renameSync|mkdir|mkdirSync|copyFile|copyFileSync|createWriteStream)\s*\(|open\(\s*['"][^'"]+['"]\s*,\s*['"]w)/

export function isWriteBashCommand(command: string): boolean {
  return WRITE_REDIRECT.test(command) || WRITE_TOKENS.test(command) || WRITE_APIS.test(command)
}

// A coordinator assigns work; it does not do it. bash and git are denied
// outright rather than asked about, because running commands and committing
// are the work. That is deliberately stricter than plan mode, and it is the
// first thing to loosen if reviewing proves impossible without `git diff` —
// with evidence, not in advance.
export const COORDINATE_RULES: Record<string, PermissionRule> = {
  ...PLAN_RULES,
  bash: 'deny',
  todowrite: 'allow',
  delegate: 'allow'
}

// delegate belongs to a coordinator alone; every other mode denies it.
const DEFAULT_RULES: Record<string, PermissionRule> = { delegate: 'deny' }

export function rulesForMode(mode: AgentMode): Record<string, PermissionRule> {
  if (mode === 'plan') return { ...PLAN_RULES, ...DEFAULT_RULES }
  if (mode === 'coordinate') return COORDINATE_RULES
  return DEFAULT_RULES
}

export function matchPattern(pattern: string, toolName: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) return toolName.startsWith(pattern.slice(0, -1))
  return pattern === toolName
}

function anyRule(rules: Record<string, PermissionRule>, toolName: string, effect: PermissionRule): boolean {
  return Object.keys(rules).some(p => matchPattern(p, toolName) && rules[p] === effect)
}

// A coordinator reviews results, so it reads history; committing is doing the
// work, so it cannot. Only subcommands known to read are allowed — an unknown
// one is refused, which is the safe direction. The list grows only with
// evidence that a specific subcommand is both needed and safe.
const READ_ONLY_GIT = new Set([
  'diff', 'status', 'log', 'show', 'blame', 'ls-files', 'rev-parse', 'describe', 'shortlog'
])

export function isReadOnlyGit(args: string | undefined): boolean {
  if (!args) return false
  // --output=<file> writes a file even from `diff`, and argv runs without a
  // shell so this is the only redirection available to it.
  if (args.includes('--output')) return false
  const [subcommand] = args.trim().split(/\s+/)
  return READ_ONLY_GIT.has(subcommand)
}

export function decidePermission(
  mode: AgentMode,
  configRules: Record<string, PermissionRule>,
  isSavedAllow: (toolName: string) => boolean,
  toolName: string,
  input?: Record<string, unknown>
): PermissionDecision {
  // A coordinator gets the reading half of git and nothing else.
  if (mode === 'coordinate' && toolName === 'git') {
    return isReadOnlyGit(typeof input?.args === 'string' ? input.args : undefined) ? 'allow' : 'deny'
  }
  // Plan mode is read-only: a write-style bash command is denied, not asked.
  if (mode === 'plan' && toolName === 'bash') {
    const command = typeof input?.command === 'string' ? input.command : ''
    if (command && isWriteBashCommand(command)) return 'deny'
  }
  const combined = { ...configRules, ...rulesForMode(mode) }
  if (anyRule(combined, toolName, 'deny')) return 'deny'
  // Plan mode is read-only: a saved always-allow (e.g. bash from build mode)
  // must not silently bypass the plan-mode ask guard.
  if (mode !== 'plan' && isSavedAllow(toolName)) return 'allow'
  if (anyRule(combined, toolName, 'allow')) return 'allow'
  return 'ask'
}
