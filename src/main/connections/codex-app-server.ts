import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export interface CodexAppServerOptions {
  codexHome: string
  executablePath?: string
  onNotification?: (method: string, params: unknown) => void
  onExit?: (code: number | null, signal: string | null) => void
}

export interface CodexAccountInfo {
  account: {
    type: string
    email?: string
    name?: string
  } | null
  requiresOpenaiAuth?: boolean
}

export interface CodexLoginStartResult {
  type: string
  loginId: string
  authUrl: string
}

export function resolveCodexExecutablePath(customPath?: string): string {
  if (customPath && existsSync(customPath)) return customPath
  return process.platform === 'win32' ? 'codex.cmd' : 'codex'
}

export class CodexAppServerClient {
  private proc: ChildProcess | null = null
  private reqId = 0
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>()
  private isInitialized = false

  constructor(private readonly options: CodexAppServerOptions) {
    mkdirSync(this.options.codexHome, { recursive: true })
  }

  get codexHome(): string {
    return this.options.codexHome
  }

  get isRunning(): boolean {
    return this.proc !== null
  }

  async start(): Promise<void> {
    if (this.proc) return
    const execPath = resolveCodexExecutablePath(this.options.executablePath)
    this.proc = spawn(execPath, ['app-server', '--listen', 'stdio://'], {
      env: { ...process.env, CODEX_HOME: this.options.codexHome },
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32'
    })

    let buffer = ''
    this.proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id)!
            this.pending.delete(msg.id)
            if (msg.error) {
              reject(new Error(msg.error.message || 'Codex RPC Error'))
            } else {
              resolve(msg.result)
            }
          } else if (msg.method) {
            this.options.onNotification?.(msg.method, msg.params)
          }
        } catch {
          // ignore corrupt lines
        }
      }
    })

    this.proc.on('exit', (code, signal) => {
      this.proc = null
      this.isInitialized = false
      for (const { reject } of this.pending.values()) {
        reject(new Error(`[bs] Codex app-server process exited (code ${code}, signal ${signal})`))
      }
      this.pending.clear()
      this.options.onExit?.(code, signal)
    })

    await this.initialize()
  }

  async initialize(): Promise<unknown> {
    if (this.isInitialized) return
    const res = await this.request('initialize', {
      clientInfo: { name: 'bs-coding', version: '1.3.2' },
      capabilities: {}
    })
    this.isInitialized = true
    return res
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.proc) {
      return Promise.reject(new Error('[bs] Codex app-server is not running'))
    }
    const id = ++this.reqId
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(`[bs] Codex RPC request ${method} timed out (30s)`))
        }
      }, 30000)

      this.pending.set(id, {
        resolve: (val) => { clearTimeout(timeout); resolve(val) },
        reject: (err) => { clearTimeout(timeout); reject(err) }
      })

      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      this.proc?.stdin?.write(req)
    })
  }

  async readAccount(): Promise<CodexAccountInfo> {
    await this.start()
    return this.request('account/read', { refreshToken: true })
  }

  async startLogin(type = 'chatgpt'): Promise<CodexLoginStartResult> {
    await this.start()
    return this.request('account/login/start', { type })
  }

  async cancelLogin(loginId: string): Promise<unknown> {
    if (!this.proc) return
    return this.request('account/login/cancel', { loginId })
  }

  async logout(): Promise<unknown> {
    if (!this.proc) return
    return this.request('account/logout', {})
  }

  async readRateLimits(): Promise<unknown> {
    await this.start()
    return this.request('account/rateLimits/read', {}).catch(() => null)
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill()
      this.proc = null
      this.isInitialized = false
    }
  }
}
