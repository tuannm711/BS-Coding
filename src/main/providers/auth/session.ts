import { randomUUID } from 'node:crypto'
import type {
  ProviderAuthorizationError,
  ProviderAuthorizationSession,
  ProviderAuthorizationStatus
} from '../../../shared/providers'

export interface PendingAuthorizationInput {
  loginId?: string
  providerId: string
  methodId: string
  reconnectAccountId?: string
  authUrl: string
  expiresAt: number
  verifier?: string
  expectedState?: string
  callbackUrl?: string
  close: () => void
}

export interface PendingAuthorizationSession extends PendingAuthorizationInput {
  loginId: string
}

interface AuthorizationRecord {
  public: ProviderAuthorizationSession
  pending: PendingAuthorizationSession
  closed: boolean
}

export interface AuthSessionCoordinatorOptions {
  now?: () => number
  onExpired?: (session: ProviderAuthorizationSession) => void
}

export class AuthSessionCoordinator {
  private readonly sessions = new Map<string, AuthorizationRecord>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly now: () => number
  private readonly onExpired?: (session: ProviderAuthorizationSession) => void

  constructor(
    nowOrOptions?: (() => number) | AuthSessionCoordinatorOptions,
    onExpired?: (session: ProviderAuthorizationSession) => void
  ) {
    if (typeof nowOrOptions === 'function') {
      this.now = nowOrOptions
      this.onExpired = onExpired
    } else if (nowOrOptions && typeof nowOrOptions === 'object') {
      this.now = nowOrOptions.now ?? Date.now
      this.onExpired = nowOrOptions.onExpired ?? onExpired
    } else {
      this.now = Date.now
      this.onExpired = onExpired
    }
  }

  start(input: PendingAuthorizationInput): ProviderAuthorizationSession {
    const loginId = input.loginId ?? randomUUID()
    const publicSession: ProviderAuthorizationSession = {
      loginId,
      providerId: input.providerId,
      methodId: input.methodId,
      reconnectAccountId: input.reconnectAccountId,
      authUrl: input.authUrl,
      expiresAt: input.expiresAt,
      status: 'waiting'
    }
    this.sessions.set(loginId, {
      public: publicSession,
      pending: {
        ...input,
        verifier: input.verifier ?? '',
        expectedState: input.expectedState ?? '',
        callbackUrl: input.callbackUrl ?? '',
        loginId
      },
      closed: false
    })

    const delay = Math.max(0, input.expiresAt - this.now())
    const timer = setTimeout(() => {
      this.timers.delete(loginId)
      const expired = this.expire(loginId)
      if (expired && this.onExpired) {
        this.onExpired(expired)
      }
    }, delay)
    this.timers.set(loginId, timer)

    return { ...publicSession }
  }

  public(loginId: string): ProviderAuthorizationSession | undefined {
    this.expireIfNeeded(loginId)
    const session = this.sessions.get(loginId)?.public
    if (!session) return undefined
    return { ...session }
  }

  pending(loginId: string): PendingAuthorizationSession | undefined {
    this.expireIfNeeded(loginId)
    const record = this.sessions.get(loginId)
    if (!record || record.public.status !== 'waiting') return undefined
    return { ...record.pending }
  }

  complete(loginId: string, accountId?: string): ProviderAuthorizationSession | undefined {
    return this.finish(loginId, 'connected', accountId ? { accountId } : {})
  }

  fail(loginId: string, error: ProviderAuthorizationError): ProviderAuthorizationSession | undefined {
    return this.finish(loginId, 'error', { error })
  }

  cancel(loginId: string): ProviderAuthorizationSession | undefined {
    return this.finish(loginId, 'cancelled', {
      error: { kind: 'authorization-cancelled', message: '[bs] OAuth authorization was cancelled' }
    })
  }

  expire(loginId: string): ProviderAuthorizationSession | undefined {
    return this.finish(loginId, 'expired', {
      error: { kind: 'authorization-expired', message: '[bs] OAuth authorization link expired' }
    })
  }

  closeAll(): void {
    for (const loginId of this.sessions.keys()) this.cancel(loginId)
  }

  private expireIfNeeded(loginId: string): void {
    const record = this.sessions.get(loginId)
    if (record?.public.status === 'waiting' && record.public.expiresAt <= this.now()) this.expire(loginId)
  }

  private finish(
    loginId: string,
    status: Exclude<ProviderAuthorizationStatus, 'waiting'>,
    patch: Partial<ProviderAuthorizationSession> = {}
  ): ProviderAuthorizationSession | undefined {
    const timer = this.timers.get(loginId)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(loginId)
    }

    const record = this.sessions.get(loginId)
    if (!record || record.public.status !== 'waiting') return undefined
    if (!record.closed) {
      record.closed = true
      record.pending.close()
    }
    record.pending.verifier = ''
    record.pending.expectedState = ''
    record.public = { ...record.public, ...patch, status }
    return { ...record.public }
  }
}
