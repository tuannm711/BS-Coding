import type { ModelMessage } from 'ai'
import type { MessageTokens } from '../../shared/types'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'
import type { ToolDefinition } from './tools/types'
import { toToolDefinition } from './message'

interface ResponsesUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number }
}

export interface ResponsesState {
  previousResponseId?: string
  compactedInput?: unknown[]
}

export interface OpenAIResponsesOptions {
  apiKey: string
  baseUrl?: string
  state?: ResponsesState
  fetchImpl?: typeof fetch
}

function toTokens(usage?: ResponsesUsage): MessageTokens | undefined {
  if (!usage) return undefined
  const cacheRead = usage.input_tokens_details?.cached_tokens ?? 0
  const input = usage.input_tokens ?? 0
  return {
    input: Math.max(0, input - cacheRead),
    output: usage.output_tokens ?? 0,
    total: usage.total_tokens ?? 0,
    cacheRead,
    reasoning: usage.output_tokens_details?.reasoning_tokens
  }
}

function toInput(messages: ModelMessage[]): unknown[] {
  return messages.map(message => ({ role: message.role, content: message.content }))
}

function toTools(tools: ToolDefinition[]): unknown[] {
  return tools.map(tool => {
    const definition = toToolDefinition(tool) as { description?: string; parameters?: unknown }
    return { type: 'function', name: tool.name, description: definition.description, parameters: definition.parameters }
  })
}

export class OpenAIResponsesClient implements LlmClient {
  private readonly fetchImpl: typeof fetch
  private readonly baseUrl: string
  readonly state: ResponsesState

  constructor(private readonly opts: OpenAIResponsesOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')
    this.state = opts.state ?? {}
  }

  async *stream(opts: LlmStreamOptions): AsyncGenerator<LlmStreamPart> {
    const input = this.state.compactedInput ?? toInput(opts.messages)
    const body = {
      model: opts.model,
      instructions: opts.system,
      input,
      tools: toTools(opts.tools),
      stream: true,
      ...(this.state.previousResponseId ? { previous_response_id: this.state.previousResponseId } : {})
    }
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal
    })
    if (!response.ok) throw new Error(`OpenAI Responses API error (${response.status})`)
    if (!response.body || !(response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const json = await response.json() as Record<string, unknown>
      yield* this.consumeCompleted(json)
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const raw = line.slice(5).trim()
        if (!raw || raw === '[DONE]') continue
        const event = JSON.parse(raw) as Record<string, unknown>
        const type = event.type
        if (type === 'response.output_text.delta') yield { kind: 'text', text: String(event.delta ?? '') }
        else if (type === 'response.reasoning_summary_text.delta') yield { kind: 'reasoning', text: String(event.delta ?? '') }
        else if (type === 'response.output_item.done') {
          const item = event.item as Record<string, unknown> | undefined
          if (item?.type === 'function_call') {
            let input: Record<string, unknown> = {}
            try { input = JSON.parse(String(item.arguments ?? '{}')) as Record<string, unknown> } catch { /* malformed tool input is handled by the loop */ }
            yield { kind: 'tool-call', toolName: String(item.name ?? ''), toolCallId: String(item.call_id ?? item.id ?? ''), toolInput: input }
          }
        } else if (type === 'response.completed') {
          const completed = event.response as Record<string, unknown> | undefined
          if (completed?.id) this.state.previousResponseId = String(completed.id)
          yield { kind: 'finish', finishReason: 'stop', tokens: toTokens(completed?.usage as ResponsesUsage | undefined) }
        } else if (type === 'error') {
          yield { kind: 'error', error: String((event.error as Record<string, unknown> | undefined)?.message ?? 'OpenAI Responses error') }
        }
      }
    }
  }

  async compact(messages: ModelMessage[], model: string, system?: string): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/responses/compact`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: toInput(messages), instructions: system })
    })
    if (!response.ok) return false
    const result = await response.json() as { output?: unknown[] }
    if (!Array.isArray(result.output)) return false
    this.state.compactedInput = result.output
    this.state.previousResponseId = undefined
    return true
  }

  private *consumeCompleted(json: Record<string, unknown>): Generator<LlmStreamPart> {
    if (json.id) this.state.previousResponseId = String(json.id)
    const output = Array.isArray(json.output) ? json.output as Array<Record<string, unknown>> : []
    for (const item of output) {
      if (item.type === 'message') {
        const content = Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : []
        for (const part of content) if (part.type === 'output_text') yield { kind: 'text', text: String(part.text ?? '') }
      }
      if (item.type === 'function_call') yield { kind: 'tool-call', toolName: String(item.name ?? ''), toolCallId: String(item.call_id ?? item.id ?? ''), toolInput: JSON.parse(String(item.arguments ?? '{}')) as Record<string, unknown> }
    }
    yield { kind: 'finish', finishReason: 'stop', tokens: toTokens(json.usage as ResponsesUsage | undefined) }
  }
}
