import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type { LlmClient, LlmStreamOptions, LlmStreamPart } from './llm'

const CLOUD_CODE_URL = 'https://cloudcode-pa.googleapis.com'

function textParts(message: ModelMessage): Array<{ text: string }> {
  if (typeof message.content === 'string') return [{ text: message.content }]
  return message.content.flatMap(part => {
    if (part.type === 'text') return [{ text: part.text }]
    return []
  })
}

function toContents(messages: ModelMessage[]) {
  return messages.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: textParts(message)
  })).filter(message => message.parts.length > 0)
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
  const envelope = value as { response?: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> }; finishReason?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }> } }
  const response = (envelope.response ?? envelope) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }> }; finishReason?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } }> }
  const candidate = response.candidates?.[0]
  if (!candidate) return []
  const parts: LlmStreamPart[] = []
  for (const part of candidate.content?.parts ?? []) {
    if (part.text) parts.push({ kind: 'text', text: part.text })
    if (part.functionCall?.name) parts.push({ kind: 'tool-call', toolName: part.functionCall.name, toolCallId: randomUUID(), toolInput: part.functionCall.args ?? {} })
  }
  if (candidate.finishReason) {
    const usage = candidate.usageMetadata
    parts.push({ kind: 'finish', finishReason: candidate.finishReason, tokens: usage ? { input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0, total: usage.totalTokenCount ?? 0 } : undefined })
  }
  return parts
}

export function createAntigravityLlm(apiKey: string, baseUrl = CLOUD_CODE_URL): LlmClient {
  return {
    async *stream(opts: LlmStreamOptions): AsyncGenerator<LlmStreamPart> {
      const body = {
        project: 'antigravity-internal-project',
        model: opts.model,
        requestId: randomUUID(),
        userAgent: 'bs-coding',
        request: {
          contents: toContents(opts.messages),
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
          'user-agent': 'antigravity/1.15.8 windows/amd64',
          'x-goog-api-client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
          'client-metadata': JSON.stringify({ ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' })
        },
        body: JSON.stringify(body),
        signal: opts.signal
      })
      if (!response.ok) {
        const detail = await response.text()
        yield { kind: 'error', error: `[bs] Antigravity request failed (${response.status}): ${detail.slice(0, 500)}` }
        return
      }
      if (!response.body) return
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const next = await reader.read()
        buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            for (const part of parseChunk(JSON.parse(line.slice(5).trim()))) yield part
          } catch { /* ignore keep-alive or partial SSE frames */ }
        }
        if (next.done) break
      }
    }
  }
}
