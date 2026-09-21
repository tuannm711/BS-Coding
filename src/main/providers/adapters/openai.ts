import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { ProviderModel } from '../../../shared/providers'
import type { ProviderAccount, ProviderUsage } from '../../../shared/types'
import type { ProviderSecrets } from '../../connections/types'
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
  getCodexPath?: () => string | undefined
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): ProviderAdapter {
  const getCodexExecutable = (): string | undefined => {
    const custom = options.getCodexPath ? options.getCodexPath() : options.codexPath
    return custom && custom.trim() ? custom.trim() : undefined
  }

  const authorization: ProviderManagedAuthorizationStrategy = {
    kind: 'managed',
    methodId: ['oauth', 'chatgpt-device-code'],
    async start(request, context) {
      const accountId = request.reconnectAccountId || `acc_${randomUUID().slice(0, 8)}`
      const userDataDir = options.userDataDir || process.cwd()
      const codexHome = path.join(userDataDir, 'providers', 'openai', accountId, 'codex-home')
      const client = new CodexAppServerClient({
        codexHome,
        executablePath: getCodexExecutable()
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
        throw new Error('[bs] ChatGPT authentication must use managed authorization')
      }

      throw new Error(`[bs] Phương thức kết nối không hỗ trợ: ${request.methodId}`)
    },

    async refreshAccount(account, secret) {
      if (account.authMode === 'oauth') {
        if (!secret?.codexHome) {
          return {
            ...account,
            status: 'error',
            lastError: '[bs] Codex home directory is missing'
          }
        }
        const client = new CodexAppServerClient({
          codexHome: secret.codexHome,
          executablePath: getCodexExecutable()
        })
        try {
          const accInfo = await client.readAccount()
          if (accInfo.requiresOpenaiAuth || !accInfo.account) {
            return {
              ...account,
              status: 'expired',
              lastError: '[bs] ChatGPT session expired or logged out. Please reconnect your account.'
            }
          }
          const email = accInfo.account.email
          const label = email || account.label
          return {
            ...account,
            label,
            status: 'active',
            lastError: undefined,
            models: modelIds,
            modelCatalog: models,
            profile: {
              ...account.profile,
              email,
              name: accInfo.account.name || email || account.profile?.name,
              planName: (accInfo.account as any).planType || account.profile?.planName
            }
          }
        } catch (err: any) {
          const msg = err?.message || String(err)
          if (/expired|unauthorized|requires.*auth|logged out/i.test(msg)) {
            return {
              ...account,
              status: 'expired',
              lastError: '[bs] ChatGPT session expired or logged out. Please reconnect your account.'
            }
          }
          return {
            ...account,
            status: 'error',
            lastError: msg || 'Failed to refresh account'
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

      const client = new CodexAppServerClient({
        codexHome: secret.codexHome,
        executablePath: getCodexExecutable()
      })
      try {
        const [rateLimitsSettled, usageSettled] = await Promise.allSettled([
          client.readRateLimits(),
          client.readUsage()
        ])

        if (rateLimitsSettled.status === 'rejected' && usageSettled.status === 'rejected') {
          const rErr = rateLimitsSettled.reason?.message || String(rateLimitsSettled.reason)
          const uErr = usageSettled.reason?.message || String(usageSettled.reason)
          return {
            accountId: account.id,
            accountLabel: account.profile?.email ?? account.label,
            accountType: 'oauth',
            refreshedAt: Date.now(),
            source: 'unavailable',
            status: 'unavailable',
            statusReason: `Failed to fetch rate limits (${rErr}) and usage (${uErr})`
          }
        }

        const rateLimitsRes = rateLimitsSettled.status === 'fulfilled' ? rateLimitsSettled.value : undefined
        const usageRes = usageSettled.status === 'fulfilled' ? usageSettled.value : undefined

        const primary = rateLimitsRes?.rateLimits?.primary
        const secondary = rateLimitsRes?.rateLimits?.secondary
        const resetCredits = rateLimitsRes?.rateLimitResetCredits
        const planType = rateLimitsRes?.rateLimits?.planType
        const summary = usageRes?.summary

        let statusReason: string | undefined
        if (rateLimitsSettled.status === 'rejected') {
          statusReason = `Rate limits unavailable: ${rateLimitsSettled.reason?.message || String(rateLimitsSettled.reason)}`
        } else if (usageSettled.status === 'rejected') {
          statusReason = `Usage summary unavailable: ${usageSettled.reason?.message || String(usageSettled.reason)}`
        }

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
          status: 'ok',
          statusReason
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

    async removeAccount(account: ProviderAccount, secret?: ProviderSecrets): Promise<void> {
      if (account.authMode !== 'oauth') return
      if (!secret?.codexHome) return

      const userDataDir = path.resolve(options.userDataDir || process.cwd())
      const expectedAccountDir = path.resolve(userDataDir, 'providers', 'openai', account.id)
      const targetHome = path.resolve(secret.codexHome)

      const rel = path.relative(expectedAccountDir, targetHome)
      const isContained = !rel.startsWith('..') && !path.isAbsolute(rel)
      const userHome = path.resolve(homedir())
      const userDotCodex = path.resolve(homedir(), '.codex')

      if (!isContained || targetHome === userHome || targetHome === userDotCodex) {
        console.warn(`[bs] Refusing to delete codexHome outside isolated account directory: ${targetHome}`)
        return
      }

      const client = new CodexAppServerClient({
        codexHome: targetHome,
        executablePath: getCodexExecutable()
      })
      try {
        await client.logout().catch(() => {})
      } finally {
        client.stop()
      }

      try {
        if (existsSync(expectedAccountDir)) {
          rmSync(expectedAccountDir, { recursive: true, force: true })
        }
      } catch (err) {
        console.warn(`[bs] Failed to remove account directory ${expectedAccountDir}:`, err)
      }
    },

    async listModels() {
      return models
    },

    createRuntime(account, secret, model) {
      if (account.authMode === 'oauth' && secret?.codexHome) {
        return new CodexAppServerLlm({ codexHome: secret.codexHome, executablePath: getCodexExecutable() })
      }
      return createLlm('openai', secret?.apiKey || '', secret?.baseUrl)
    }
  }
}
