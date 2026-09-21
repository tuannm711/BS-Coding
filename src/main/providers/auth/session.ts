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
  verificationUrl?: string
  userCode?: string
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

export class AuthSessionCoordinator {
  private readonly sessions = new Map<string, AuthorizationRecord>()

  constructor(private readonly now: () => number = Date.now) {}

  start(input: PendingAuthorizationInput): ProviderAuthorizationSession {
    const loginId = input.loginId ?? randomUUID()
    const publicSession: ProviderAuthorizationSession = {
      loginId,
      providerId: input.providerId,
      methodId: input.methodId,
      reconnectAccountId: input.reconnectAccountId,
      authUrl: input.authUrl,
      verificationUrl: input.verificationUrl,
      userCode: input.userCode,
      expiresAt: input.expiresAt,
      verifier: '',
      expectedState: '',
      callbackUrl: '',
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
    const res = { ...publicSession }
    delete (res as any).verifier
    delete (res as any).expectedState
    delete (res as any).callbackUrl
    return res
  }

  public(loginId: string): ProviderAuthorizationSession | undefined {
    this.expireIfNeeded(loginId)
    const session = this.sessions.get(loginId)?.public
    if (!session) return undefined
    const res = { ...session }
    delete (res as any).verifier
    delete (res as any).expectedState
    delete (res as any).callbackUrl
    return res
  }

  pending(loginId: string): PendingAuthorizationSession | undefined {
    this.expireIfNeeded(loginId)
    const record = this.sessions.get(loginId)
    if (!record || record.public.status !== 'waiting') return undefined
    return { ...record.pending }
  }

  complete(loginId: string, accountId: string): ProviderAuthorizationSession | undefined {
    return this.finish(loginId, 'connected', {})
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
    const record = this.sessions.get(loginId)
    if (!record || record.public.status !== 'waiting') return undefined
    if (!record.closed) {
      record.closed = true
      record.pending.close()
    }
    record.pending.verifier = ''
    record.pending.expectedState = ''
    record.public = { ...record.public, ...patch, status }
    const res = { ...record.public }
    delete (res as any).verifier
    delete (res as any).expectedState
    delete (res as any).callbackUrl
    return res
  }
}
