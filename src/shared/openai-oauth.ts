export const OPENAI_OAUTH_MODELS = [
  'gpt-5.6',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.5-pro',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5-codex',
  'codex-mini-latest'
] as const

export function isActiveOpenAiOAuthAccount(providerId: string, authMode: string, status: string): boolean {
  return providerId === 'openai' && authMode === 'oauth' && status === 'active'
}
