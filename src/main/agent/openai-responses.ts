import type { ModelMessage } from 'ai'
import type { MessageTokens } from '../../shared/types'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'
import type { ToolDefinition, ToolSchema } from './tools/types'
import { decodeProviderResponse } from './provider-stream'

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
  headers?: Record<string, string>
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

type ResponsesContent =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string }
  | { type: 'output_text'; text: string }

export type ResponsesInputItem =
  | { role: 'user' | 'developer'; content: ResponsesContent[] }
  | { role: 'assistant'; content: Array<Extract<ResponsesContent, { type: 'output_text' }>> }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

function responseArguments(input: unknown): string {
  if (typeof input === 'string') {
    try { return JSON.stringify(JSON.parse(input) as unknown) } catch { return JSON.stringify({ value: input }) }
  }
  return JSON.stringify(input && typeof input === 'object' ? input : {})
}

function responseOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (output && typeof output === 'object') {
    const typed = output as { type?: unknown; value?: unknown }
    if ((typed.type === 'text' || typed.type === 'error-text') && typeof typed.value === 'string') return typed.value
    if (typed.type === 'json') return JSON.stringify(typed.value)
  }
  return JSON.stringify(output ?? '')
}

function inputImage(part: Record<string, unknown>): string | undefined {
  const image = part.image
  if (typeof image === 'string') return image
  if (image instanceof URL) return image.toString()
  return undefined
}

export function toResponsesInput(messages: ModelMessage[]): ResponsesInputItem[] {
  const input: ResponsesInputItem[] = []
  for (const message of messages) {
    if (message.role === 'system') {
      const text = typeof message.content === 'string' ? message.content : ''
      if (text) input.push({ role: 'developer', content: [{ type: 'input_text', text }] })
      continue
    }
    if (message.role === 'user') {
      const content: ResponsesContent[] = []
      if (typeof message.content === 'string') content.push({ type: 'input_text', text: message.content })
      else for (const rawPart of message.content) {
        const part = rawPart as unknown as Record<string, unknown>
        if (part.type === 'text') content.push({ type: 'input_text', text: String(part.text ?? '') })
        if (part.type === 'image') {
          const imageUrl = inputImage(part)
          if (imageUrl) content.push({ type: 'input_image', image_url: imageUrl })
        }
      }
      if (content.length > 0) input.push({ role: 'user', content })
      continue
    }
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        if (message.content) input.push({ role: 'assistant', content: [{ type: 'output_text', text: message.content }] })
        continue
      }
      let text: Array<Extract<ResponsesContent, { type: 'output_text' }>> = []
      const flushText = () => {
        if (text.length > 0) input.push({ role: 'assistant', content: text })
        text = []
      }
      for (const rawPart of message.content) {
        const part = rawPart as unknown as Record<string, unknown>
        if (part.type === 'text') text.push({ type: 'output_text', text: String(part.text ?? '') })
        if (part.type === 'tool-call') {
          flushText()
          input.push({
            type: 'function_call',
            call_id: String(part.toolCallId ?? ''),
            name: String(part.toolName ?? ''),
            arguments: responseArguments(part.input)
          })
        }
      }
      flushText()
      continue
    }
    if (message.role === 'tool') {
      for (const rawPart of message.content) {
        const part = rawPart as unknown as Record<string, unknown>
        if (part.type !== 'tool-result') continue
        input.push({
          type: 'function_call_output',
          call_id: String(part.toolCallId ?? ''),
          output: responseOutput(part.output)
        })
      }
    }
  }
  return input
}

function toResponsesParameters(schema: ToolSchema): Record<string, unknown> {
  const convertible = schema as { toJSONSchema?: () => unknown }
  const converted = typeof convertible.toJSONSchema === 'function'
    ? convertible.toJSONSchema()
    : schema
  if (!converted || typeof converted !== 'object' || Array.isArray(converted)) {
    return { type: 'object', properties: {} }
  }
  const { $schema: _schema, ...parameters } = converted as Record<string, unknown>
  return parameters
}

function toTools(tools: ToolDefinition[]): unknown[] {
  return tools.map(definition => ({
    type: 'function',
    name: definition.name,
    description: definition.description,
    parameters: toResponsesParameters(definition.schema)
  }))
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
    const input = this.state.compactedInput ?? toResponsesInput(opts.messages)
    const body = {
      model: opts.model,
      instructions: opts.system,
      input,
      tools: toTools(opts.tools),
      stream: true,
      store: false,
      ...(this.state.previousResponseId ? { previous_response_id: this.state.previousResponseId } : {}),
      ...(opts.serviceTier ? { service_tier: opts.serviceTier } : {})
    }
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json', ...this.opts.headers },
      body: JSON.stringify(body),
      signal: opts.signal
    })
    if (!response.ok) {
      let detail = ''
      try {
        const errorBody = await response.text()
        const parsed = JSON.parse(errorBody) as { error?: { message?: string; detail?: string }; detail?: string; message?: string }
        detail = parsed.error?.message ?? parsed.error?.detail ?? parsed.detail ?? parsed.message ?? errorBody
      } catch { /* preserve the status when the response is not JSON */ }
      throw new Error(`OpenAI Responses API error (${response.status})${detail ? `: ${detail}` : ''}`)
    }
    for await (const decoded of decodeProviderResponse(response, { maxBytes: 16 * 1024 * 1024 })) {
      if (decoded.kind === 'parse-error') yield { kind: 'error', error: decoded.message }
      else if (decoded.kind === 'json') yield* this.consumeCompleted(decoded.value)
      else yield* this.consumeEvent(decoded.event)
    }
  }

  async compact(messages: ModelMessage[], model: string, system?: string): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/responses/compact`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.opts.apiKey}`, 'content-type': 'application/json', ...this.opts.headers },
      body: JSON.stringify({ model, input: toResponsesInput(messages), instructions: system })
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

  private *consumeEvent(event: Record<string, unknown>): Generator<LlmStreamPart> {
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
