import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { ProviderAuthorizationErrorKind } from '../../shared/providers'

export interface PkceChallenge {
  verifier: string
  challenge: string
  state: string
}

export function createPkce(): PkceChallenge {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge, state: randomUUID() }
}

export interface CallbackResult {
  code: string
  state: string
}

export interface CallbackHandle {
  port: number
  callbackUrl: string
  result: Promise<CallbackResult>
  close: () => void
}

export interface CallbackOptions {
  port?: number
  path?: string
  timeoutMs?: number
}

export class OAuthCallbackError extends Error {
  constructor(readonly kind: ProviderAuthorizationErrorKind, message: string) {
    super(message)
    this.name = 'OAuthCallbackError'
  }
}

export async function listenForCallback(options: CallbackOptions = {}): Promise<CallbackHandle> {
  const requestedPort = options.port ?? 1455
  const callbackPath = options.path ?? '/auth/callback'
  const timeoutMs = options.timeoutMs ?? 300_000
  let server: Server | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let resolveResult: (value: CallbackResult) => void = () => {}
  let rejectResult: (reason: OAuthCallbackError) => void = () => {}
  const result = new Promise<CallbackResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const close = () => {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    if (server) {
      server.close()
      server = undefined
    }
  }
  const rejectOnce = (error: OAuthCallbackError) => {
    if (settled) return
    settled = true
    close()
    rejectResult(error)
  }
  const resolveOnce = (value: CallbackResult) => {
    if (settled) return
    settled = true
    close()
    resolveResult(value)
  }

  server = createServer((req, res) => {
    const address = server?.address()
    const port = typeof address === 'object' && address ? address.port : requestedPort
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    if (url.pathname !== callbackPath) {
      res.writeHead(404).end()
      return
    }
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (error) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('OAuth authorization failed.')
      rejectOnce(new OAuthCallbackError('authorization-denied', '[bs] OAuth authorization was denied'))
      return
    }
    if (!code || !state) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('OAuth callback is incomplete.')
      rejectOnce(new OAuthCallbackError('token-exchange-failed', '[bs] OAuth callback is missing code or state'))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('BS Coding login complete. You can close this tab.')
    resolveOnce({ code, state })
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server?.removeListener('listening', onListening)
      close()
      reject(error.code === 'EADDRINUSE'
        ? new OAuthCallbackError('callback-port-unavailable', `[bs] OAuth callback port ${requestedPort} is unavailable`)
        : error)
    }
    const onListening = () => {
      server?.removeListener('error', onError)
      resolve()
    }
    server!.once('error', onError)
    server!.once('listening', onListening)
    server!.listen(requestedPort, '127.0.0.1')
  })

  server.on('error', () => {
    rejectOnce(new OAuthCallbackError('callback-port-unavailable', '[bs] OAuth callback listener failed'))
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : requestedPort
  const callbackUrl = `http://127.0.0.1:${port}${callbackPath}`
  timer = setTimeout(() => {
    rejectOnce(new OAuthCallbackError('authorization-expired', '[bs] OAuth authorization link expired'))
  }, timeoutMs)
  return { port, callbackUrl, result, close }
}
