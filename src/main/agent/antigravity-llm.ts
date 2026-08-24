import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'
import { decodeProviderResponse } from './provider-stream'

const CLOUD_CODE_URL = 'https://daily-cloudcode-pa.googleapis.com'

interface AntigravityRuntimeContext {
  baseUrl?: string
  projectId?: string
  modelId?: string
  isGemini3?: boolean
}

function toContents(messages: ModelMessage[], useGemini3SignatureFallback = false) {
  return messages.map(message => {
    if (typeof message.content === 'string') return { role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }
    const parts: Array<{ text: string } | { functionCall: { id: string; name: string; args: object }; thoughtSignature?: string } | { functionResponse: { id: string; name: string; response: object } }> = []
    for (const part of message.content) {
      if (part.type === 'text') parts.push({ text: part.text })
      if (part.type === 'tool-call') {
        const signature = part.providerOptions?.google?.thoughtSignature
        const effectiveSignature = typeof signature === 'string' && signature
          ? signature
          : useGemini3SignatureFallback
            ? 'skip_thought_signature_validator'
            : undefined
        parts.push({
          functionCall: { id: part.toolCallId, name: part.toolName, args: part.input && typeof part.input === 'object' ? part.input : {} },
          ...(effectiveSignature ? { thoughtSignature: effectiveSignature } : {})
        })
      }
      if (part.type === 'tool-result') {
        const output = part.output
        const response = output.type === 'error-text' ? { error: output.value } : output.type === 'text' ? { output: output.value } : { output }
        parts.push({ functionResponse: { id: part.toolCallId, name: part.toolName, response } })
      }
    }
    return { role: message.role === 'assistant' ? 'model' : 'user', parts }
  }).filter(message => message.parts.length > 0)
}

function toCloudSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCloudSchema)
  if (!value || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const allowed = ['type', 'title', 'description', 'required', 'enum', 'items', 'properties', 'additionalProperties']
  const result: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in source) result[key] = key === 'properties' && source[key] && typeof source[key] === 'object'
      ? Object.fromEntries(Object.entries(source[key] as Record<string, unknown>).map(([name, schema]) => [name, toCloudSchema(schema)]))
      : toCloudSchema(source[key])
  }
  return result
}

function parseChunk(value: unknown): LlmStreamPart[] {
  const envelope = value as { response?: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thoughtSignature?: string; functionCall?: { id?: string; name?: string; args?: Record<string, unknown> } }> }; finishReason?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }> } }
  const response = (envelope.response ?? envelope) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thoughtSignature?: string; functionCall?: { id?: string; name?: string; args?: Record<string, unknown> } }> }; finishReason?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }> }
  const candidate = response.candidates?.[0]
  if (!candidate) return []
  const parts: LlmStreamPart[] = []
  for (const part of candidate.content?.parts ?? []) {
    if (part.text) parts.push({ kind: 'text', text: part.text })
    if (part.functionCall?.name) parts.push({ kind: 'tool-call', toolName: part.functionCall.name, toolCallId: part.functionCall.id ?? randomUUID(), toolInput: part.functionCall.args ?? {}, thoughtSignature: part.thoughtSignature })
  }
  if (candidate.finishReason) {
    const usage = candidate.usageMetadata
    parts.push({ kind: 'finish', finishReason: candidate.finishReason, tokens: usage ? { input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0, total: usage.totalTokenCount ?? 0 } : undefined })
  }
  return parts
}

export function createAntigravityLlm(apiKey: string, context: string | AntigravityRuntimeContext = {}): LlmClient {
  const resolved = typeof context === 'string' ? { baseUrl: context } : context
  const baseUrl = resolved.baseUrl ?? CLOUD_CODE_URL
  return {
    async *stream(opts: LlmStreamOptions): AsyncGenerator<LlmStreamPart> {
      const body = {
        project: resolved.projectId,
        model: resolved.modelId ?? opts.model,
        requestId: randomUUID(),
        userAgent: 'antigravity',
        request: {
          contents: toContents(opts.messages, resolved.isGemini3 ?? /^gemini-3(?:\.|-|$)/i.test(opts.model)),
          systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
          generationConfig: { maxOutputTokens: 8192 },
          tools: opts.tools.length > 0 ? [{ functionDeclarations: opts.tools.map(tool => {
            const raw = typeof (tool.schema as { toJSONSchema?: () => unknown }).toJSONSchema === 'function'
              ? (tool.schema as { toJSONSchema: () => unknown }).toJSONSchema()
              : tool.schema
            return { name: tool.name, description: tool.description, parameters: toCloudSchema(raw) }
          }) }] : undefined
        }
      }
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1internal:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'user-agent': 'antigravity/1.20.5 windows/amd64',
          'x-goog-api-client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
          'client-metadata': JSON.stringify({ ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' })
        },
        body: JSON.stringify(body),
        signal: opts.signal
      })
      if (!response.ok) {
        const detail = await response.text()
        const retryAfter = response.headers.get('retry-after')
        const code = response.status === 404 && /NOT_FOUND|not found/i.test(detail) ? 'runtime-entity-not-found' : 'request-failed'
        yield { kind: 'error', error: `[bs] [${code}] Antigravity request failed (${response.status}): ${detail.slice(0, 500)}${retryAfter ? `; retry-after=${retryAfter}` : ''}` }
        return
      }
      for await (const decoded of decodeProviderResponse(response, { maxBytes: 16 * 1024 * 1024 })) {
        if (decoded.kind === 'parse-error') {
          yield { kind: 'error', error: `[bs] [stream-invalid] ${decoded.message}` }
          continue
        }
        const value = decoded.kind === 'event' ? decoded.event : decoded.value
        for (const part of parseChunk(value)) yield part
      }
    }
  }
}
