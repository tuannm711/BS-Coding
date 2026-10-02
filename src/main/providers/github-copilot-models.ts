import type { ProviderModel } from '../../shared/providers'

const DEFAULT_API = 'https://api.githubcopilot.com'
export const COPILOT_RUNTIME_HEADERS = { 'editor-version': 'vscode/1.95.0', 'copilot-integration-id': 'vscode-chat' }

export function copilotApiBaseUrl(value?: string): string {
  if (value === undefined) return DEFAULT_API
  let url: URL
  try { url = new URL(value) } catch { throw new Error('[bs] Invalid Copilot API endpoint') }
  if (url.protocol !== 'https:' || !/^api(?:\.[a-z0-9-]+)*\.githubcopilot\.com$/i.test(url.hostname)
    || url.username || url.password || url.search || url.hash || (url.port && url.port !== '443') || url.pathname !== '/') {
    throw new Error('[bs] Untrusted Copilot API endpoint')
  }
  return url.origin
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function positive(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined }
function plan(value?: string): string | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase().replace(/^copilot_/, '').replace('pro+', 'pro_plus')
  return ['free', 'student', 'pro', 'pro_plus', 'max', 'business', 'enterprise'].includes(normalized) ? normalized : undefined
}

export function parseGitHubCopilotModels(payload: unknown, planName?: string): ProviderModel[] {
  const data = object(payload).data
  if (!Array.isArray(data)) throw new Error('[bs] GitHub Copilot returned an invalid model catalog')
  const models = new Map<string, ProviderModel>()
  const accountPlan = plan(planName)
  for (const raw of data) {
    const model = object(raw)
    if (typeof model.id !== 'string' || !model.id.trim() || model.id.length > 200 || models.has(model.id)) continue
    if (model.model_picker_enabled !== true
      || (model.enabled !== undefined && model.enabled !== true)
      || (model.disabled !== undefined && model.disabled !== false)) continue
    if (model.policy !== undefined && (!model.policy || typeof model.policy !== 'object' || Array.isArray(model.policy))) continue
    const policy = object(model.policy)
    if (policy.state !== 'enabled') continue
    const capabilities = object(model.capabilities)
    const supports = object(capabilities.supports)
    if ((capabilities.type !== undefined && capabilities.type !== 'chat') || supports.streaming !== true || supports.tool_calls !== true) continue
    const restricted = object(model.billing).restricted_to
    if (restricted !== undefined && !Array.isArray(restricted)) continue
    if (Array.isArray(restricted) && restricted.length && (!accountPlan || !restricted.some(value => typeof value === 'string' && plan(value) === accountPlan))) continue
    let transport: ProviderModel['transport'] = 'openai-compatible'
    if (model.supported_endpoints !== undefined) {
      if (!Array.isArray(model.supported_endpoints)) continue
      const endpoints = model.supported_endpoints.flatMap(value => typeof value === 'string' ? [value.replace(/^\//, '')] : [])
      if (endpoints.includes('chat/completions') || endpoints.includes('chat-completions')) transport = 'openai-compatible'
      else if (endpoints.includes('responses')) transport = 'openai-responses'
      else continue
    }
    const limits = object(capabilities.limits)
    const contextWindow = positive(limits.max_context_window_tokens)
    const maxOutputTokens = positive(limits.max_output_tokens)
    models.set(model.id, { id: model.id, name: typeof model.name === 'string' && model.name.trim() ? model.name.slice(0, 200) : model.id, transport,
      capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true,
        ...(contextWindow === undefined ? {} : { contextWindow }), ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }) } })
  }
  return [...models.values()]
}
