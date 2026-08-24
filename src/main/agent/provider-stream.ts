export type ProviderDecodedItem =
  | { kind: 'event'; event: Record<string, unknown> }
  | { kind: 'json'; value: Record<string, unknown> }
  | { kind: 'parse-error'; message: string }

function parseSseFrame(frame: string): ProviderDecodedItem | null {
  const data: string[] = []
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (line === 'data') data.push('')
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  const raw = data.join('\n').trim()
  if (!raw || raw === '[DONE]') return null
  try {
    const event = JSON.parse(raw) as unknown
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { kind: 'parse-error', message: '[bs] Provider SSE data was not a JSON object' }
    }
    return { kind: 'event', event: event as Record<string, unknown> }
  } catch (error) {
    return { kind: 'parse-error', message: `[bs] Provider SSE event was invalid JSON: ${String(error)}` }
  }
}

function takeSseFrame(buffer: string): { frame: string; rest: string } | null {
  const separator = /\r?\n\r?\n/.exec(buffer)
  if (!separator || separator.index === undefined) return null
  const end = separator.index + separator[0].length
  return { frame: buffer.slice(0, separator.index), rest: buffer.slice(end) }
}

export async function* decodeProviderResponse(
  response: Response,
  options: { maxBytes: number }
): AsyncGenerator<ProviderDecodedItem> {
  if (!response.body) {
    yield { kind: 'parse-error', message: '[bs] Provider response body was empty' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  let mode: 'sse' | 'json' | undefined = contentType.includes('text/event-stream') ? 'sse' : undefined
  let buffer = ''
  let bytes = 0

  while (true) {
    const next = await reader.read()
    if (next.value) {
      bytes += next.value.byteLength
      if (bytes > options.maxBytes) {
        await reader.cancel()
        yield { kind: 'parse-error', message: `[bs] Provider response exceeded ${options.maxBytes} bytes` }
        return
      }
      buffer += decoder.decode(next.value, { stream: !next.done })
    }

    if (!mode) {
      const prefix = buffer.trimStart()
      if (/^(?:event|data):|^:/.test(prefix)) mode = 'sse'
      else if (prefix.startsWith('{') || prefix.startsWith('[') || (next.done && prefix)) mode = 'json'
    }

    if (mode === 'sse') {
      let extracted = takeSseFrame(buffer)
      while (extracted) {
        buffer = extracted.rest
        const item = parseSseFrame(extracted.frame)
        if (item) yield item
        extracted = takeSseFrame(buffer)
      }
    }

    if (next.done) break
  }

  buffer += decoder.decode()
  if (mode === 'sse') {
    const item = parseSseFrame(buffer)
    if (item) yield item
    return
  }

  const raw = buffer.trim()
  if (!raw) {
    yield { kind: 'parse-error', message: '[bs] Provider response body was empty' }
    return
  }
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      yield { kind: 'parse-error', message: '[bs] Provider JSON response was not an object' }
      return
    }
    yield { kind: 'json', value: value as Record<string, unknown> }
  } catch (error) {
    yield { kind: 'parse-error', message: `[bs] Provider response was invalid JSON: ${String(error)}` }
  }
}
