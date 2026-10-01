import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { AgentSettings, AppearanceSettings, CompactionSettings, BsSettings, NotificationsSettings, PermissionRule, QuickMessage } from '../../shared/types'
import { DEFAULT_APPEARANCE, isHexColor, normalizeAppearance } from '../../shared/appearance'
import type { McpServerConfig } from './mcp/manager'

export type { PermissionRule }
export type { McpServerConfig }

export interface BsProviderConfig {
  apiKeyEnv?: string
  apiKey?: string
  /** Reference into the encrypted vault (safeStorage) — preferred over apiKey. */
  keyRef?: string
  baseUrl?: string
  models: string[]
}

export interface BsAgentConfig {
  provider?: string
  model?: string
  accountId?: string
  quotaPoolId?: string
  speed?: 'standard' | 'fast'
  systemPrompt: string
}

export type BsCompactionConfig = CompactionSettings

export interface ToolOutputConfig {
  maxBytes: number
  maxLines: number
}

export interface LspConfig {
  enabled: boolean
  diagnosticsTimeoutMs: number
}

export type NotificationsConfig = NotificationsSettings

export interface TraceConfig {
  enabled: boolean
}

export interface BsConfig {
  appearance?: AppearanceSettings
  provider: Record<string, BsProviderConfig>
  model: string
  agents: Record<string, BsAgentConfig>
  quickMessages?: QuickMessage[]
  permission: Record<string, PermissionRule>
  mcp: Record<string, McpServerConfig>
  maxContextTokens: number
  maxSteps: number
  compaction: BsCompactionConfig
  toolOutput: ToolOutputConfig
  lsp: LspConfig
  notifications?: NotificationsConfig
  trace?: TraceConfig
}

export interface ResolvedAgentConfig {
  provider: string
  model: string
  accountId?: string
  apiKey: string | null
  baseUrl?: string
  systemPrompt: string
}

// Fallback only when the model is absent from the models.dev catalog; most
// uncatalogued OpenAI-compatible models cap at 128k, so assuming 200k would
// delay compaction past the real limit.
export const DEFAULT_MAX_CONTEXT_TOKENS = 128000
export const DEFAULT_MAX_STEPS = Infinity
export const DEFAULT_COMPACTION: BsCompactionConfig = {
  auto: true,
  buffer: 20000,
  keepTokens: 8000,
  tailTurns: 2,
  toolOutputMaxChars: 2000,
  prune: true
}
export const DEFAULT_TOOL_OUTPUT: ToolOutputConfig = {
  maxBytes: 51200,
  maxLines: 2000
}
export const DEFAULT_LSP: LspConfig = {
  enabled: true,
  diagnosticsTimeoutMs: 3000
}
export const DEFAULT_TRACE: TraceConfig = {
  enabled: false
}
export const DEFAULT_NOTIFICATIONS: NotificationsConfig = {
  needsInput: true,
  onDone: true
}

export const DEFAULT_BS_CONFIG: BsConfig = {
  appearance: DEFAULT_APPEARANCE,
  provider: {},
  model: '',
  agents: {
    bs: {
      systemPrompt: 'You are BS, a coding agent running inside the BS Coding desktop app. ' +
        'You help the user build and maintain their codebase. You have access to tools like ' +
        'bash, read, write, edit, glob, grep, apply-patch and todowrite. Read files before ' +
        'editing them, run tests after changes, and keep answers concise. Whenever you need ' +
        'input or a decision from the user, use the question tool to show an interactive form ' +
        'instead of writing questions as plain text.'
    }
  },
  permission: {
    read: 'allow',
    write: 'allow',
    edit: 'allow',
    glob: 'allow',
    grep: 'allow',
    'apply-patch': 'allow',
    todowrite: 'allow',
    task: 'allow',
    revert: 'allow',
    skill: 'allow',
    bash: 'ask',
    office: 'ask',
    question: 'allow',
    'browser_*': 'allow'
  },
  mcp: {},
  maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
  maxSteps: DEFAULT_MAX_STEPS,
  compaction: DEFAULT_COMPACTION,
  toolOutput: DEFAULT_TOOL_OUTPUT,
  lsp: DEFAULT_LSP,
  notifications: DEFAULT_NOTIFICATIONS,
  trace: DEFAULT_TRACE
}

type RawProvider = Partial<BsProviderConfig> & Record<string, unknown>

function normalizeProvider(raw: RawProvider): BsProviderConfig {
  const models = Array.isArray(raw.models)
    ? (raw.models as string[]).filter(m => typeof m === 'string' && m.trim() !== '')
    : typeof raw.model === 'string' && raw.model
      ? [raw.model]
      : []
  return {
    apiKeyEnv: raw.apiKeyEnv,
    apiKey: raw.apiKey,
    keyRef: raw.keyRef,
    baseUrl: raw.baseUrl,
    models
  }
}

function normalizeAgents(raw: Record<string, unknown> | undefined): Record<string, BsAgentConfig> {
  const base = DEFAULT_BS_CONFIG.agents
  const defaults = Object.fromEntries(Object.entries(base).map(([name, agent]) => [name, { ...agent }]))
  if (!raw) return defaults
  const out: Record<string, BsAgentConfig> = {}
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue
    const v = value as Partial<BsAgentConfig> & Record<string, unknown>
    const legacyModel = typeof v.model === 'string' ? v.model : undefined
    const isProviderRef = typeof v.provider !== 'string' && legacyModel !== undefined && !legacyModel.includes('/')
    out[name] = {
      provider: typeof v.provider === 'string' ? v.provider : (isProviderRef ? legacyModel : undefined),
      model: typeof v.model === 'string' && !isProviderRef ? v.model : undefined,
      accountId: typeof v.accountId === 'string' ? v.accountId : undefined,
      quotaPoolId: typeof v.quotaPoolId === 'string' ? v.quotaPoolId : undefined,
      speed: v.speed === 'fast' ? 'fast' : 'standard',
      systemPrompt: typeof v.systemPrompt === 'string' ? v.systemPrompt : (base[name]?.systemPrompt ?? base.bs.systemPrompt)
    }
  }
  return out
}

function normalizeQuickMessages(raw: unknown): QuickMessage[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap(value => {
    if (!value || typeof value.id !== 'string' || !value.id.trim() || seen.has(value.id)
      || typeof value.name !== 'string' || !value.name.trim()
      || typeof value.message !== 'string' || !value.message.trim()) return []
    seen.add(value.id)
    return [{ id: value.id, name: value.name.trim(), message: value.message }]
  })
}

function normalizeCompaction(raw: Partial<BsCompactionConfig> | undefined): BsCompactionConfig {
  return {
    auto: raw?.auto ?? DEFAULT_COMPACTION.auto,
    buffer: raw?.buffer ?? DEFAULT_COMPACTION.buffer,
    keepTokens: raw?.keepTokens ?? DEFAULT_COMPACTION.keepTokens,
    tailTurns: raw?.tailTurns ?? DEFAULT_COMPACTION.tailTurns,
    toolOutputMaxChars: raw?.toolOutputMaxChars ?? DEFAULT_COMPACTION.toolOutputMaxChars,
    prune: raw?.prune ?? DEFAULT_COMPACTION.prune
  }
}

function normalizeToolOutput(raw: Partial<ToolOutputConfig> | undefined): ToolOutputConfig {
  return {
    maxBytes: raw?.maxBytes ?? DEFAULT_TOOL_OUTPUT.maxBytes,
    maxLines: raw?.maxLines ?? DEFAULT_TOOL_OUTPUT.maxLines
  }
}

function normalizeTrace(raw: Partial<TraceConfig> | undefined): TraceConfig {
  return {
    enabled: raw?.enabled ?? DEFAULT_TRACE.enabled
  }
}

function normalizeLsp(raw: Partial<LspConfig> | undefined): LspConfig {
  return {
    enabled: raw?.enabled ?? DEFAULT_LSP.enabled,
    diagnosticsTimeoutMs: raw?.diagnosticsTimeoutMs ?? DEFAULT_LSP.diagnosticsTimeoutMs
  }
}

function normalizeNotifications(raw: Partial<NotificationsConfig> | undefined): NotificationsConfig {
  return {
    needsInput: raw?.needsInput ?? DEFAULT_NOTIFICATIONS.needsInput,
    onDone: raw?.onDone ?? DEFAULT_NOTIFICATIONS.onDone
  }
}

function normalizeMcp(raw: Record<string, McpServerConfig> | undefined): Record<string, McpServerConfig> {
  const out: Record<string, McpServerConfig> = {}
  for (const [name, cfg] of Object.entries(raw ?? {})) {
    const next: McpServerConfig = { ...cfg }
    if (next.command) {
      const parts = next.command.trim().split(/\s+/).filter(Boolean)
      if (parts.length > 1 && (!next.args || next.args.length === 0)) {
        next.command = parts[0]
        next.args = parts.slice(1)
      }
    }
    out[name] = next
  }
  return out
}

function mergeDefaults(raw: Partial<BsConfig>): BsConfig {
  const providers: Record<string, BsProviderConfig> = {}
  for (const [id, p] of Object.entries(raw.provider ?? {})) {
    providers[id] = normalizeProvider(p as RawProvider)
  }
  return {
    provider: providers,
    appearance: normalizeAppearance(raw.appearance),
    model: raw.model ?? DEFAULT_BS_CONFIG.model,
    agents: normalizeAgents(raw.agents),
    quickMessages: normalizeQuickMessages(raw.quickMessages),
    permission: { ...DEFAULT_BS_CONFIG.permission, ...(raw.permission ?? {}) },
    mcp: normalizeMcp(raw.mcp),
    maxContextTokens: raw.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
    maxSteps: raw.maxSteps ?? DEFAULT_MAX_STEPS,
    compaction: normalizeCompaction(raw.compaction),
    toolOutput: normalizeToolOutput(raw.toolOutput),
    lsp: normalizeLsp(raw.lsp),
    notifications: normalizeNotifications(raw.notifications),
    trace: normalizeTrace(raw.trace)
  }
}

export function loadBsConfig(filePath: string): BsConfig {
  if (!existsSync(filePath)) return mergeDefaults({})
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (typeof parsed !== 'object' || parsed === null) return mergeDefaults({})
    return mergeDefaults(parsed as Partial<BsConfig>)
  } catch {
    return mergeDefaults({})
  }
}

export function resolveApiKey(
  provider: BsProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
  getSecret?: (ref: string) => string | null
): string | null {
  if (provider.apiKey) return provider.apiKey
  if (provider.keyRef && getSecret) {
    const secret = getSecret(provider.keyRef)
    if (secret) return secret
  }
  if (provider.apiKeyEnv) return env[provider.apiKeyEnv] ?? null
  return null
}

export function resolveAgentConfig(
  cfg: BsConfig,
  agentName: string,
  env: NodeJS.ProcessEnv = process.env,
  agentModel?: string,
  getSecret?: (ref: string) => string | null
): ResolvedAgentConfig {
  const agent = cfg.agents[agentName] ?? { systemPrompt: DEFAULT_BS_CONFIG.agents.bs.systemPrompt }
  let providerName = agent.provider ?? cfg.model
  let modelName: string | undefined
  if (agentModel) {
    const slash = agentModel.indexOf('/')
    if (slash > 0) {
      providerName = agentModel.slice(0, slash)
      modelName = agentModel.slice(slash + 1)
    } else {
      providerName = agentModel
    }
  } else if (agent.model) {
    const slash = agent.model.indexOf('/')
    if (slash > 0) {
      providerName = agent.model.slice(0, slash)
      modelName = agent.model.slice(slash + 1)
    } else {
      providerName = agent.model
    }
  }
  const provider = cfg.provider[providerName]
  if (!provider) {
    return { provider: '', model: '', accountId: agent.accountId, apiKey: null, systemPrompt: agent.systemPrompt }
  }
  const model = modelName ? (provider.models.includes(modelName) ? modelName : '') : (provider.models[0] ?? '')
  return {
    provider: providerName,
    model,
    accountId: agent.accountId,
    apiKey: resolveApiKey(provider, env, getSecret),
    baseUrl: provider.baseUrl,
    systemPrompt: agent.systemPrompt
  }
}

export function configToSettings(cfg: BsConfig): BsSettings {
  return {
    appearance: normalizeAppearance(cfg.appearance),
    providers: Object.entries(cfg.provider).map(([id, p]) => ({
      id,
      apiKey: p.apiKey ?? '',
      keyRef: p.keyRef,
      baseUrl: p.baseUrl,
      models: p.models
    })),
    defaultProvider: cfg.model,
    quickMessages: normalizeQuickMessages(cfg.quickMessages),
    agents: Object.entries(cfg.agents).map(([name, a]) => ({
      name,
      systemPrompt: a.systemPrompt,
      provider: a.provider,
      model: a.model,
      accountId: a.accountId,
      quotaPoolId: a.quotaPoolId,
      speed: a.speed
    })),
    permission: cfg.permission,
    mcp: cfg.mcp,
    maxContextTokens: cfg.maxContextTokens,
    maxSteps: cfg.maxSteps,
    compaction: cfg.compaction,
    toolOutput: cfg.toolOutput,
    lsp: cfg.lsp,
    notifications: cfg.notifications ? normalizeNotifications(cfg.notifications) : DEFAULT_NOTIFICATIONS,
    trace: normalizeTrace(cfg.trace)
  }
}

/**
 * What settingsToConfig actually accepts. Every field but these two is read
 * through a fallback to `base`, so a caller may omit it — which is the whole
 * point of passing a base config. Declaring the parameter as a full BsSettings
 * said otherwise and was contradicted by the function's own body.
 */
export type SettingsInput = Pick<BsSettings, 'providers' | 'defaultProvider'> & Partial<BsSettings>

export function settingsToConfig(settings: SettingsInput, base: BsConfig = DEFAULT_BS_CONFIG): BsConfig {
  if (settings.appearance && !Object.values(settings.appearance).every(isHexColor)) {
    throw new Error('Appearance colors must use six-digit HEX codes, for example #4da3ff.')
  }
  const quickMessages = normalizeQuickMessages(settings.quickMessages ?? base.quickMessages)
  if (settings.quickMessages && quickMessages.length !== settings.quickMessages.length) {
    throw new Error('Quick messages need a unique ID, a name and message content.')
  }
  const providers: Record<string, BsProviderConfig> = {}
  for (const p of settings.providers) {
    const models = (p.models ?? []).filter(m => typeof m === 'string' && m.trim() !== '')
    if (!p.id.trim()) continue
    providers[p.id.trim()] = {
      apiKey: p.apiKey || undefined,
      keyRef: p.keyRef || undefined,
      baseUrl: p.baseUrl || undefined,
      models,
      apiKeyEnv: p.apiKey || p.keyRef ? undefined : `${p.id.trim().toUpperCase()}_API_KEY`
    }
  }
  const defaultProvider = providers[settings.defaultProvider] ? settings.defaultProvider : (Object.keys(providers)[0] ?? '')
  const agents: Record<string, BsAgentConfig> = {}
  for (const a of settings.agents ?? []) {
    if (!a.name.trim()) continue
    agents[a.name.trim()] = {
      provider: a.provider,
      model: a.model,
      accountId: a.accountId,
      quotaPoolId: a.quotaPoolId,
      speed: a.speed,
      systemPrompt: a.systemPrompt
    }
  }
  return {
    provider: providers,
    appearance: normalizeAppearance(settings.appearance ?? base.appearance),
    model: defaultProvider,
    agents: settings.agents === undefined ? (base.agents ?? DEFAULT_BS_CONFIG.agents) : agents,
    quickMessages,
    permission: settings.permission
      ? { ...DEFAULT_BS_CONFIG.permission, ...settings.permission }
      : (base.permission ?? DEFAULT_BS_CONFIG.permission),
    mcp: normalizeMcp(settings.mcp ?? base.mcp ?? {}),
    maxContextTokens: settings.maxContextTokens ?? base.maxContextTokens ?? DEFAULT_MAX_CONTEXT_TOKENS,
    maxSteps: settings.maxSteps ?? base.maxSteps ?? DEFAULT_MAX_STEPS,
    compaction: settings.compaction ? normalizeCompaction(settings.compaction) : normalizeCompaction(base.compaction),
    toolOutput: settings.toolOutput ? normalizeToolOutput(settings.toolOutput) : normalizeToolOutput(base.toolOutput),
    lsp: settings.lsp ? normalizeLsp(settings.lsp) : normalizeLsp(base.lsp),
    notifications: settings.notifications
      ? normalizeNotifications(settings.notifications)
      : normalizeNotifications(base.notifications),
    trace: normalizeTrace(settings.trace ?? base.trace)
  }
}

export function writeBsConfig(filePath: string, cfg: BsConfig): void {
  writeBsConfigText(filePath, JSON.stringify(cfg, null, 2))
}

export function writeBsConfigText(filePath: string, text: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, text)
  renameSync(temp, filePath)
}
