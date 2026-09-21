import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'
import type { MessageTokens } from '../../shared/types'
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
    let lastTokens: MessageTokens | undefined = undefined

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
          const deltaText = typeof params?.delta === 'string'
            ? params.delta
            : (params?.delta?.text || params?.text || '')
          if (deltaText) {
            pushPart({ kind: 'text', text: deltaText })
          }
        } else if (method === 'item/reasoning/textDelta') {
          const reasoningText = typeof params?.delta === 'string'
            ? params.delta
            : (params?.delta?.text || params?.text || '')
          if (reasoningText) {
            pushPart({ kind: 'reasoning', text: reasoningText })
          }
        } else if (method === 'thread/tokenUsage/updated') {
          const breakdown = params?.tokenUsage?.last || params?.tokenUsage?.total
          if (breakdown) {
            lastTokens = {
              input: breakdown.inputTokens ?? 0,
              output: breakdown.outputTokens ?? 0,
              total: breakdown.totalTokens ?? 0,
              cacheRead: breakdown.cachedInputTokens ?? 0,
              cacheWrite: breakdown.cacheWriteInputTokens ?? 0
            }
          }
        } else if (method === 'turn/completed' || method === 'turnCompleted') {
          if (params?.turn?.status === 'failed' || params?.turn?.error) {
            const msg = params?.turn?.error?.message || 'Codex turn execution failed'
            errorOccurred = msg
            pushPart({ kind: 'error', error: msg })
            finished = true
          } else {
            const usage = params?.turn?.usage
            const tokens = lastTokens || (usage ? {
              input: usage.inputTokens ?? usage.promptTokens ?? 0,
              output: usage.outputTokens ?? usage.completionTokens ?? 0,
              total: usage.totalTokens ?? 0
            } : undefined)
            pushPart({
              kind: 'finish',
              finishReason: 'stop',
              tokens
            })
            finished = true
          }
        } else if (method === 'error' || method === 'turn/error') {
          const msg = params?.message || params?.error?.message || 'Codex execution error'
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

    let abortHandler: (() => void) | null = null

    try {
      await client.start()

      // Construct prompt from messages
      const promptText = opts.messages.map(m => {
        if (typeof m.content === 'string') return `${m.role}: ${m.content}`
        return `${m.role}: ${JSON.stringify(m.content)}`
      }).join('\n\n')

      const threadRes = await client.request('thread/start', {
        model: opts.model,
        baseInstructions: opts.system || undefined,
        cwd: opts.cwd || undefined
      })

      const threadId = threadRes?.thread?.id
      if (!threadId) {
        throw new Error('[bs] Failed to create Codex thread')
      }

      const turnRes = await client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: promptText, text_elements: [] }]
      })

      const turnId = turnRes?.turn?.id

      if (opts.signal) {
        abortHandler = () => {
          if (turnId) {
            client.request('turn/interrupt', { threadId, turnId }).catch(() => {})
          }
        }
        opts.signal.addEventListener('abort', abortHandler, { once: true })
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
      if (opts.signal && abortHandler) {
        opts.signal.removeEventListener('abort', abortHandler)
      }
      await client.stop()
    }
  }
}
