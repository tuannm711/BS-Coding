import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAccount, ProviderUsage } from '../../../shared/types'
import type { ProviderAdapter, ProviderManagedAuthorizationStrategy } from '../types'
import { createLlm } from '../../agent/llm'
import { OPENAI_OAUTH_MODELS } from '../../../shared/openai-oauth'
import { CodexAppServerClient } from '../../connections/codex-app-server'
import { CodexAppServerLlm } from '../../agent/codex-app-server-llm'

const models: ProviderModel[] = OPENAI_OAUTH_MODELS.map(id => ({
  id,
  name: id,
  capabilities: { isCodeModel: true, supportsStreaming: true, supportsTools: false, speedModes: ['standard', 'fast'] }
}))
const modelIds = models.map(m => m.id)

export interface OpenAiAdapterOptions {
  userDataDir?: string
  codexPath?: string
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): ProviderAdapter {
  const authorization: ProviderManagedAuthorizationStrategy = {
    kind: 'managed',
    methodId: ['oauth', 'chatgpt-device-code'],
    async start(request, context) {
      const accountId = request.reconnectAccountId || `acc_${randomUUID().slice(0, 8)}`
      const userDataDir = options.userDataDir || process.cwd()
      const codexHome = path.join(userDataDir, 'providers', 'openai', accountId, 'codex-home')
      const client = new CodexAppServerClient({
        codexHome,
        executablePath: options.codexPath
      })
      await client.start()

      const isDeviceCode = request.methodId === 'chatgpt-device-code'
      const login = await client.startLogin(isDeviceCode ? 'chatgptDeviceCode' : 'chatgpt')

      let isCompleted = false

      const completeAccount = async (success: boolean, errorMsg?: string | null) => {
        if (isCompleted) return
        isCompleted = true
        try {
          if (success) {
            const accInfo = await client.readAccount().catch(() => null)
            const email = accInfo?.account?.email
            const planType = (accInfo?.account as any)?.planType
            const label = email || `ChatGPT (${accountId})`
            const account = context.saveAccount({
              id: accountId,
              providerId: 'openai',
              label,
              authMode: 'oauth',
              status: 'active',
              models: modelIds,
              modelCatalog: models,
              profile: {
                email,
                name: email || label,
                planName: planType
              }
            }, { codexHome })
            context.onConnected({ loginId: login.loginId, account })
          } else {
            context.onError({
              loginId: login.loginId,
              error: {
                kind: 'authorization-denied',
                message: errorMsg || '[bs] ChatGPT login không thành công'
              }
            })
          }
        } finally {
          client.stop()
        }
      }

      client.onNotification('account/login/completed', (params: any) => {
        if (params?.loginId === login.loginId || !params?.loginId) {
          void completeAccount(params?.success !== false, params?.error)
        }
      })

      return {
        loginId: login.loginId,
        authUrl: login.authUrl || login.verificationUrl || '',
        verificationUrl: login.verificationUrl,
        userCode: login.userCode,
        expiresAt: Date.now() + 300_000,
        close: () => {
          if (!isCompleted) {
            isCompleted = true
            client.cancelLogin(login.loginId).catch(() => {})
            client.stop()
          }
        }
      }
    }
  }

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
          id: 'chatgpt-device-code',
          label: 'Sign in with Device Code',
          description: 'Sign in using a one-time code on openai.com',
          kind: 'oauth',
          fields: [],
          opensBrowser: false,
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

    authorization,

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

      if (request.methodId === 'oauth' || request.methodId === 'chatgpt-device-code') {
        const accountId = request.reconnectAccountId || `acc_${randomUUID().slice(0, 8)}`
        const userDataDir = options.userDataDir || process.cwd()
        const codexHome = path.join(userDataDir, 'providers', 'openai', accountId, 'codex-home')
        const client = new CodexAppServerClient({ codexHome, executablePath: options.codexPath })
        try {
          const isDevice = request.methodId === 'chatgpt-device-code'
          const login = await client.startLogin(isDevice ? 'chatgptDeviceCode' : 'chatgpt')
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
              authUrl: login.authUrl || login.verificationUrl || '',
              verificationUrl: login.verificationUrl,
              userCode: login.userCode,
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
        const client = new CodexAppServerClient({ codexHome: secret.codexHome, executablePath: options.codexPath })
        try {
          const accInfo = await client.readAccount()
          if (accInfo.account?.email) {
            return {
              ...account,
              label: accInfo.account.email,
              status: 'active',
              models: modelIds,
              modelCatalog: models,
              profile: {
                email: accInfo.account.email,
                name: accInfo.account.name || accInfo.account.email,
                planName: (accInfo.account as any).planType || account.profile?.planName
              }
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

    async fetchUsage(account, secret): Promise<ProviderUsage> {
      if (account.authMode !== 'oauth' || !secret?.codexHome) {
        return {
          accountId: account.id,
          accountLabel: account.profile?.email ?? account.label,
          accountType: account.authMode === 'api-key' ? 'api-key' : 'oauth',
          refreshedAt: Date.now(),
          source: 'unavailable',
          status: 'unavailable',
          statusReason: 'Usage is not applicable for API key accounts'
        }
      }

      const client = new CodexAppServerClient({ codexHome: secret.codexHome, executablePath: options.codexPath })
      try {
        const [rateLimitsRes, usageRes] = await Promise.all([
          client.readRateLimits(),
          client.readUsage()
        ])

        const primary = rateLimitsRes?.rateLimits?.primary
        const secondary = rateLimitsRes?.rateLimits?.secondary
        const resetCredits = rateLimitsRes?.rateLimitResetCredits
        const planType = rateLimitsRes?.rateLimits?.planType
        const summary = usageRes?.summary

        return {
          accountId: account.id,
          accountLabel: account.profile?.email ?? account.label,
          accountType: 'oauth',
          planName: planType ?? account.profile?.planName,
          primaryUsedPercent: primary?.usedPercent,
          secondaryUsedPercent: secondary?.usedPercent,
          resetAt: primary?.resetsAt ? primary.resetsAt * 1000 : undefined,
          secondaryResetAt: secondary?.resetsAt ? secondary.resetsAt * 1000 : undefined,
          resetCredits: resetCredits ? {
            available: resetCredits.available ?? 0,
            applicable: resetCredits.applicable ?? 0
          } : undefined,
          tokensInput: summary?.lifetimeTokens ? Number(summary.lifetimeTokens) : undefined,
          refreshedAt: Date.now(),
          source: 'provider',
          status: 'ok'
        }
      } catch (err: any) {
        return {
          accountId: account.id,
          accountLabel: account.profile?.email ?? account.label,
          accountType: 'oauth',
          refreshedAt: Date.now(),
          source: 'unavailable',
          status: 'unavailable',
          statusReason: err.message || 'Failed to fetch Codex usage'
        }
      } finally {
        client.stop()
      }
    },

    async listModels() {
      return models
    },

    createRuntime(account, secret, model) {
      if (account.authMode === 'oauth' && secret?.codexHome) {
        return new CodexAppServerLlm({ codexHome: secret.codexHome, executablePath: options.codexPath })
      }
      return createLlm('openai', secret?.apiKey || '', secret?.baseUrl)
    }
  }
}
