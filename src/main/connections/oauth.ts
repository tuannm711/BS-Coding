import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'

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
  result: Promise<CallbackResult>
  close: () => void
}

export function listenForCallback(port = 1455, timeoutMs = 300_000): CallbackHandle {
  let server: Server | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let settle: (value: CallbackResult) => void = () => {}
  let reject: (reason: Error) => void = () => {}
  const result = new Promise<CallbackResult>((resolve, rejectPromise) => {
    settle = resolve
    reject = rejectPromise
  })
  const close = () => {
    if (timer) clearTimeout(timer)
    server?.close()
    server = undefined
  }
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    if (url.pathname !== '/auth/callback') {
      res.writeHead(404).end()
      return
    }
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (error || !code || !state) {
      res.writeHead(400).end('OAuth login failed')
      close()
      reject(new Error(error ?? 'OAuth callback missing code/state'))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('BS Coding login complete. You can close this tab.')
    close()
    settle({ code, state })
  })
  server.on('error', (error: NodeJS.ErrnoException) => {
    close()
    reject(error.code === 'EADDRINUSE' ? new Error('[bs] Cổng OAuth 1455 đang được sử dụng') : error)
  })
  server.listen(port, '127.0.0.1')
  timer = setTimeout(() => {
    close()
    reject(new Error('[bs] Đăng nhập OAuth hết thời gian chờ'))
  }, timeoutMs)
  return { port, result, close }
}
