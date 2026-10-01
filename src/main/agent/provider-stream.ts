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

function takeSseFrame(buffer: string): { frame: string; rest: string; separatorBytes: number } | null {
  const separator = /\r?\n\r?\n/.exec(buffer)
  if (!separator || separator.index === undefined) return null
  const end = separator.index + separator[0].length
  return { frame: buffer.slice(0, separator.index), rest: buffer.slice(end), separatorBytes: separator[0].length }
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
  // The limit bounds one frame (or a JSON response), not an entire stream.
  // SSE overhead grows with delta count even when every frame is tiny.
  let bufferBytes = 0

  try {
    while (true) {
      const next = await reader.read()
      if (next.value) {
        const decoded = decoder.decode(next.value, { stream: !next.done })
        buffer += decoded
        bufferBytes += Buffer.byteLength(decoded, 'utf8')
      }

      if (!mode) {
        const prefix = buffer.trimStart()
        if (/^(?:event|data):|^:/.test(prefix)) mode = 'sse'
        else if (prefix.startsWith('{') || prefix.startsWith('[') || (next.done && prefix)) mode = 'json'
      }

      if (mode === 'sse') {
        let extracted = takeSseFrame(buffer)
        while (extracted) {
          const frameBytes = Buffer.byteLength(extracted.frame, 'utf8')
          if (frameBytes > options.maxBytes) {
            yield { kind: 'parse-error', message: `[bs] Provider frame exceeded ${options.maxBytes} bytes` }
            return
          }
          buffer = extracted.rest
          bufferBytes -= frameBytes + extracted.separatorBytes
          const item = parseSseFrame(extracted.frame)
          if (item) yield item
          extracted = takeSseFrame(buffer)
        }
      }

      if (bufferBytes > options.maxBytes) {
        yield { kind: 'parse-error', message: `[bs] Provider buffered response exceeded ${options.maxBytes} bytes` }
        return
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
  } finally {
    // A consumer can stop after a terminal event or error before EOF.
    // Cancel unread data and release the fetch body's lock on every path.
    try { await reader.cancel() } catch { /* a disconnected body is already closed */ }
    reader.releaseLock()
  }
}
