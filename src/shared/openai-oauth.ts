export const OPENAI_OAUTH_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5-codex',
  'codex-mini-latest'
] as const

export function isOpenAiCodexModel(model: string): boolean {
  return model.endsWith('-codex') || model === 'codex-mini-latest' || /^gpt-5\.6-(sol|terra|luna)$/.test(model)
}

export function isOpenAiGenericModel(model: string): boolean {
  return model.startsWith('gpt-') && !isOpenAiCodexModel(model)
}

export function normalizeOpenAiCodexModel(model: string): string {
  return isOpenAiGenericModel(model) ? OPENAI_OAUTH_MODELS[0] : model
}

export function isActiveOpenAiOAuthAccount(providerId: string, authMode: string, status: string): boolean {
  return providerId === 'openai' && authMode === 'oauth' && status === 'active'
}
