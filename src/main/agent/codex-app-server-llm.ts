import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'
import { CodexAppServerClient } from '../connections/codex-app-server'

export interface CodexAppServerLlmOptions {
  codexHome: string
  executablePath?: string
}

export class CodexAppServerLlm implements LlmClient {
  constructor(private readonly options: CodexAppServerLlmOptions) {}

  async *stream(opts: LlmStreamOptions): AsyncGenerator<LlmStreamPart> {
    const streamQueue: LlmStreamPart[] = []
    let errorOccurred: string | null = null
    let finished = false
    let resolveNext: (() => void) | null = null

    const pushPart = (part: LlmStreamPart) => {
      streamQueue.push(part)
      if (resolveNext) {
        const resolve = resolveNext
        resolveNext = null
        resolve()
      }
    }

    const client = new CodexAppServerClient({
      codexHome: this.options.codexHome,
      executablePath: this.options.executablePath,
      onNotification: (method, params: any) => {
        if (method === 'item/agentMessage/delta' || method === 'agentMessageDelta') {
          const deltaText = params?.delta?.text || params?.text || ''
          if (deltaText) {
            pushPart({ kind: 'text', text: deltaText })
          }
        } else if (method === 'turn/completed' || method === 'turnCompleted') {
          const usage = params?.turn?.usage
          pushPart({
            kind: 'finish',
            finishReason: 'stop',
            tokens: usage ? {
              input: usage.inputTokens ?? usage.promptTokens ?? 0,
              output: usage.outputTokens ?? usage.completionTokens ?? 0,
              total: usage.totalTokens ?? 0
            } : undefined
          })
          finished = true
        } else if (method === 'error' || method === 'turn/error') {
          const msg = params?.message || 'Codex execution error'
          errorOccurred = msg
          pushPart({ kind: 'error', error: msg })
          finished = true
        }
      },
      onExit: (code, signal) => {
        if (!finished && !errorOccurred) {
          errorOccurred = `Codex app-server exited (code ${code})`
          pushPart({ kind: 'error', error: errorOccurred })
          finished = true
        }
      }
    })

    try {
      await client.start()

      // Construct prompt from messages
      const promptText = opts.messages.map(m => {
        if (typeof m.content === 'string') return `${m.role}: ${m.content}`
        return `${m.role}: ${JSON.stringify(m.content)}`
      }).join('\n\n')

      const threadRes = await client.request('thread/start', {
        model: opts.model,
        instructionSources: opts.system ? [opts.system] : []
      })

      const threadId = threadRes?.thread?.id
      if (!threadId) {
        throw new Error('[bs] Failed to create Codex thread')
      }

      const turnRes = await client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: promptText }]
      })

      const turnId = turnRes?.turn?.id

      // Abort signal handler
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => {
          if (turnId) {
            client.request('turn/interrupt', { threadId, turnId }).catch(() => {})
          }
        })
      }

      // Yield streamed parts
      while (!finished || streamQueue.length > 0) {
        if (streamQueue.length > 0) {
          const part = streamQueue.shift()!
          yield part
          if (part.kind === 'finish' || part.kind === 'error') break
        } else {
          await new Promise<void>(resolve => {
            resolveNext = resolve
            setTimeout(resolve, 50)
          })
        }
      }
    } catch (err: any) {
      yield { kind: 'error', error: err.message || String(err) }
    } finally {
      client.stop()
    }
  }
}
