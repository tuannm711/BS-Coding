import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAdapter } from '../types'
import { createLlm } from '../../agent/llm'
import { OPENAI_OAUTH_MODELS } from '../../../shared/openai-oauth'
import { CodexAppServerClient } from '../../connections/codex-app-server'
import { CodexAppServerLlm } from '../../agent/codex-app-server-llm'

const models: ProviderModel[] = OPENAI_OAUTH_MODELS.map(id => ({
  id,
  name: id,
  capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: true, speedModes: ['standard', 'fast'] }
}))
const modelIds = models.map(m => m.id)

export interface OpenAiAdapterOptions {
  userDataDir?: string
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): ProviderAdapter {
  return {
    capability: {
      id: 'openai',
      displayName: 'OpenAI / ChatGPT',
      description: 'ChatGPT OAuth via Codex App Server or OpenAI API key',
      methods: [
        {
          id: 'oauth',
          label: 'Sign in with ChatGPT',
          description: 'Sign in with your ChatGPT subscription using official Codex App Server',
          kind: 'oauth',
          fields: [],
          opensBrowser: true,
          supportsMultipleAccounts: true
        },
        {
          id: 'api-key',
          label: 'API key',
          description: 'Use an OpenAI API key and optional base URL',
          kind: 'api-key',
          fields: ['apiKey', 'baseUrl'],
          supportsMultipleAccounts: true
        }
      ],
      status: 'ready',
      chatTransport: 'codex-app-server'
    },

    authorization: {
      methodId: 'oauth',
      callback: { port: 1455, path: '/auth/callback', timeoutMs: 300_000 },
      build({ pkce }) {
        return {
          authUrl: `https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_EMoamEEZ73f0CkXaXp7hrann&code_challenge=${pkce.challenge}&code_challenge_method=S256&state=${pkce.state}`,
          expectedState: pkce.state
        }
      },
      async complete() {
        throw new Error('[bs] ChatGPT login được thực hiện qua Codex App Server')
      }
    },

    definition() {
      return this.capability
    },

    async connect(request, context) {
      if (request.methodId === 'api-key') {
        const apiKey = request.fields.apiKey?.trim()
        if (!apiKey) throw new Error('[bs] OpenAI API key không được để trống')
        const label = request.fields.label?.trim() || `OpenAI (${apiKey.slice(0, 4)}...)`
        const account = context.saveAccount({
          providerId: 'openai',
          label,
          authMode: 'api-key',
          status: 'active',
          models: modelIds,
          modelCatalog: models,
          profile: { name: label }
        }, { apiKey, baseUrl: request.fields.baseUrl })
        return { account }
      }

      if (request.methodId === 'oauth') {
        const accountId = request.reconnectAccountId || `acc_${randomUUID().slice(0, 8)}`
        const userDataDir = options.userDataDir || process.cwd()
        const codexHome = path.join(userDataDir, 'providers', 'openai', accountId, 'codex-home')

        const client = new CodexAppServerClient({ codexHome })
        try {
          const login = await client.startLogin('chatgpt')
          const account = context.saveAccount({
            id: accountId,
            providerId: 'openai',
            label: `ChatGPT Account (${accountId})`,
            authMode: 'oauth',
            status: 'active',
            models: modelIds,
            modelCatalog: models,
            profile: { name: `ChatGPT Account (${accountId})` }
          }, { codexHome })

          return {
            account,
            login: {
              loginId: login.loginId,
              authUrl: login.authUrl,
              expiresIn: 300
            }
          }
        } finally {
          client.stop()
        }
      }

      throw new Error(`[bs] Phương thức kết nối không hỗ trợ: ${request.methodId}`)
    },

    async refreshAccount(account, secret) {
      if (account.authMode === 'oauth' && secret?.codexHome) {
        const client = new CodexAppServerClient({ codexHome: secret.codexHome })
        try {
          const accInfo = await client.readAccount()
          if (accInfo.account?.email) {
            return {
              ...account,
              label: accInfo.account.email,
              status: 'active',
              models: modelIds,
              modelCatalog: models,
              profile: { email: accInfo.account.email, name: accInfo.account.name || accInfo.account.email }
            }
          }
        } catch (err: any) {
          return {
            ...account,
            status: 'error',
            lastError: `Codex account read failed: ${err.message}`
          }
        } finally {
          client.stop()
        }
      }
      return { ...account, status: 'active', models: modelIds, modelCatalog: models }
    },

    async listModels() {
      return models
    },

    createRuntime(account, secret, model) {
      if (account.authMode === 'oauth' && secret?.codexHome) {
        return new CodexAppServerLlm({ codexHome: secret.codexHome })
      }
      return createLlm('openai', secret?.apiKey || '', secret?.baseUrl)
    }
  }
}
